#include <senshamart/client/camera.hpp>
#include <senshamart/senshamart_client.hpp>
#include <stdexcept>
#include <vector>
#include <opencv2/opencv.hpp>
#include <random>
#include <deque>
#include <climits>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/opt.h>
}

namespace {
  struct AVFrame_closer {
    void operator()(AVFrame* p) const noexcept {
      av_frame_free(&p);
    }
  };

  using Frame = std::unique_ptr<AVFrame, AVFrame_closer>;

  struct AVPacket_closer {
    void operator()(AVPacket* p) const noexcept {
      av_packet_free(&p);
    }
  };

  using Packet = std::unique_ptr<AVPacket, AVPacket_closer>;

  struct AVCodecContext_closer {
    void operator()(AVCodecContext* p) const noexcept {
      avcodec_free_context(&p);
    }
  };

  using Codec_context = std::unique_ptr<AVCodecContext, AVCodecContext_closer>;

  struct AVFormatContext_closer {
    void operator()(AVFormatContext* p) const noexcept {
      if (p != nullptr && p->pb != nullptr) {
        if (p->pb->buffer != nullptr) {
          av_free(p->pb->buffer);
        }
        avio_context_free(&p->pb);
      }
      avformat_free_context(p);
    }
  };

  using Format_context = std::unique_ptr<AVFormatContext, AVFormatContext_closer>;

  struct Camera_impl final {
  public:
    //interface public
    Camera_impl(senshamart::Camera_info const& init_info) :
      camera_client_(init_info.broker_endpoint, init_info.camera_sensor_name),
      gps_client_(init_info.broker_endpoint, init_info.gps_sensor_name) {

      video_init_(init_info);
    }

    void add_frame(void* data, std::size_t size, senshamart::Clock::time_point time) {
      //we assume the data is B G R, one byte per
      assert(size == 3 * width_ * height_);
      cv::Mat frame{ static_cast<int>(height_), static_cast<int>(width_), CV_8UC3, data};

      out_frame_->pts = in_frame_count_;

      if (av_frame_make_writable(out_frame_.get()) < 0) {
        fprintf(stderr, "Couldn't make frame writable\n");
        std::exit(-1);
      }

      cv::Mat cv_frame_converted;
      cv::cvtColor(frame, cv_frame_converted, cv::COLOR_BGR2YUV_I420);

      for (int y = 0; y < height_; ++y) {
        for (int x = 0; x < width_; ++x) {
          out_frame_->data[0][y * out_frame_->linesize[0] + x] = cv_frame_converted.at<uint8_t>(y, x);
        }
      }

      for (int i = 0; i < width_ * height_ / 4; ++i) {
        const int to_x = i % (width_ / 2);
        const int to_y = i / (width_ / 2);
        const int from_x = i / width_;
        const int from_y = i % width_;

        out_frame_->data[1][to_y * out_frame_->linesize[1] + to_x] = cv_frame_converted.at<uint8_t>(height_ + from_x, from_y);
        out_frame_->data[2][to_y * out_frame_->linesize[2] + to_x] = cv_frame_converted.at<uint8_t>((height_ / 4) * 5 + from_x, from_y);
      }

      if (avcodec_send_frame(codec_ctx_.get(), out_frame_.get()) < 0) {
        throw std::runtime_error{ "Couldn't send frame" };
      }

      ++in_frame_count_;

      while (avcodec_receive_packet(codec_ctx_.get(), packet_.get()) >= 0) {
        write_encoded_(
          packet_.get());
        av_packet_unref(packet_.get());
      }
    }

    void add_gps(senshamart::Longitude longitude, senshamart::Latitude latitude, double speed, senshamart::Clock::time_point time) {
      std::stringstream constructing;
      constructing <<
        "{"
        "\"latitude\":" << latitude.val << ","
        "\"longitude\":" << longitude.val << ","
        "\"speed\":" << speed << ","
        "\"when\":" << std::chrono::duration_cast<std::chrono::seconds>(time.time_since_epoch()).count() <<
        "}";
      gps_client_.send(constructing.str());
    }

    void finish() {
    }

    ~Camera_impl() {
      finish();
    }
  private:
    void write_encoded_(AVPacket* packet) {
      if ((packet->flags & AV_PKT_FLAG_KEY) != 0) {
        //flush
        av_write_frame(fmt_ctx_.get(), nullptr);
        //send

        if (!buffer_.empty()) {
          camera_client_.send(std::move(buffer_));
          buffer_.clear();
        }
      }

      av_packet_rescale_ts(packet, codec_ctx_->time_base, vid_stream_->time_base);
      packet->stream_index = 0;
      av_write_frame(fmt_ctx_.get(), packet);
    }

    void video_init_(senshamart::Camera_info const& init_info) {
      //encoding

      width_ = init_info.width;
      height_ = init_info.height;

      codec_ = avcodec_find_encoder_by_name("libvpx-vp9");

      if (codec_ == nullptr) {
        fprintf(stderr, "Couldn't find codec");
        std::exit(-1);
      }

      codec_ctx_.reset(avcodec_alloc_context3(codec_));

      if (codec_ctx_ == nullptr) {
        fprintf(stderr, "Couldn't open codec context");
        std::exit(-1);
      }

      codec_ctx_->time_base = AVRational{ 1,25 };
      codec_ctx_->framerate = AVRational{ 25,1 };
      codec_ctx_->width = width_;
      codec_ctx_->height = height_;
      codec_ctx_->gop_size = 25;
      codec_ctx_->keyint_min = 25;
      codec_ctx_->max_b_frames = 1;
      codec_ctx_->pix_fmt = AVPixelFormat::AV_PIX_FMT_YUV420P;

      if (avcodec_open2(codec_ctx_.get(), codec_, nullptr) < 0) {
        fprintf(stderr, "Couldn't open codec");
        std::exit(-1);
      }

      out_frame_.reset(av_frame_alloc());

      if (out_frame_ == nullptr) {
        fprintf(stderr, "Couldn't open frame");
        std::exit(-1);
      }

      out_frame_->width = width_;
      out_frame_->height = height_;
      out_frame_->format = codec_ctx_->pix_fmt;

      if (av_frame_get_buffer(out_frame_.get(), 0) < 0) {
        fprintf(stderr, "Couldn't make frame buffer");
        std::exit(-1);
      }

      //muxing

      fmt_ctx_.reset(avformat_alloc_context());
      if (fmt_ctx_ == nullptr) {
        fprintf(stderr, "Couldn't create out fmt ctx\n");
        std::exit(-1);
      }

      fmt_ctx_->oformat = av_guess_format(nullptr, ".webm", nullptr);
      if (fmt_ctx_->oformat == nullptr) {
        fprintf(stderr, "Couldn't find format for .webm\n");
        std::exit(-1);
      }

      fmt_ctx_->pb = avio_alloc_context(static_cast<unsigned char*>(av_malloc(4096)), 4096, 1,
        this, nullptr, &static_mux_cb_, nullptr);

      vid_stream_ = avformat_new_stream(fmt_ctx_.get(), codec_);
      if (vid_stream_ == nullptr) {
        fprintf(stderr, "Couldn't make stream\n");
        std::exit(-1);
      }
      vid_stream_->time_base = codec_ctx_->time_base;
      vid_stream_->r_frame_rate = { 5,1 };
      vid_stream_->avg_frame_rate = { 5,1 };
      if (avcodec_parameters_from_context(vid_stream_->codecpar, codec_ctx_.get()) < 0) {
        fprintf(stderr, "Couldn't set codecpar\n");
        std::exit(-1);
      }

      if (avformat_init_output(fmt_ctx_.get(), nullptr) < 0) {
        fprintf(stderr, "Could not init output fmt\n");
        std::exit(-1);
      }

      av_opt_set(fmt_ctx_->priv_data, "dash", "1", 0);
      av_opt_set(fmt_ctx_->priv_data, "live", "1", 0);

      if (avformat_write_header(fmt_ctx_.get(), nullptr) < 0) {
        fprintf(stderr, "Couldn't write header\n");
        std::exit(-1);
      }

      if (av_write_frame(fmt_ctx_.get(), nullptr) < 0) {
        fprintf(stderr, "Couldn't flush header\n");
        std::exit(-1);
      }

      FILE* header = fopen("./video_header", "wb");
      if (header == nullptr) {
        fprintf(stderr, "Couldn't open file for header\n");
        std::exit(-1);
      }
      for (char c : buffer_) {
        fputc(c, header);
      }
      fclose(header);

      buffer_.clear();
    }

    int mux_cb_(uint8_t* data, int size) noexcept {
      buffer_.resize(buffer_.size() + size);
      memcpy(buffer_.data() + buffer_.size() - size, data, size);
      return 0;
    }

    static int static_mux_cb_(void* opaque, uint8_t* p, int size) noexcept {
      return static_cast<Camera_impl*>(opaque)->mux_cb_(p, size);
    }

    //video stuff
    std::size_t width_;
    std::size_t height_;

    //encoding
    int64_t in_frame_count_ = 0;
    const AVCodec* codec_ = nullptr;
    Codec_context codec_ctx_;
    Packet packet_{ av_packet_alloc() };
    Frame out_frame_;
    //muxing
    AVStream* vid_stream_ = nullptr;
    Format_context fmt_ctx_;

    std::string buffer_;

    //mqtt
    senshamart::Client camera_client_;
    senshamart::Client gps_client_;
  };
}

//client
senshamart::Camera::Camera(Camera_info const& init_info) :
  pimpl_(new Camera_impl(init_info)) {
  assert(pimpl_ != nullptr);
}

void senshamart::Camera::add_frame(void* data, std::size_t size) {
		add_frame(data, size, Clock::now());
}

void senshamart::Camera::add_frame(void* data, std::size_t size, Clock::time_point time) {
	static_cast<Camera_impl*>(pimpl_.get())->add_frame(data, size, time);
}

void senshamart::Camera::add_frame(cv::Mat const& cv_frame) {
  add_frame(cv_frame, Clock::now());
}

void senshamart::Camera::add_frame(cv::Mat const& cv_frame, Clock::time_point time) {
  if(!cv_frame.isContinuous()) {
    cv::Mat copying_to;
    cv_frame.copyTo(copying_to);
    assert(copying_to.isContinuous());
    static_cast<Camera_impl*>(pimpl_.get())->add_frame(copying_to.data, copying_to.elemSize() * copying_to.total(), time);
  } else {
    static_cast<Camera_impl*>(pimpl_.get())->add_frame(cv_frame.data, cv_frame.elemSize() * cv_frame.total(), time);
  }
}

void senshamart::Camera::add_gps(Latitude latitude, Longitude longitude, double speed, Clock::time_point time) {
	add_gps(longitude, latitude, speed, time);
}

void senshamart::Camera::add_gps(Longitude longitude, Latitude latitude, double speed, Clock::time_point time) {
	static_cast<Camera_impl*>(pimpl_.get())->add_gps(longitude, latitude, speed, time);
}

void senshamart::Camera::Pimpl_deleter_::operator()(void* p) const noexcept {
	if(p != nullptr) {
		delete static_cast<Camera_impl*>(p);
	}
}