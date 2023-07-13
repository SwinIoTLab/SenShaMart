#include <senshamart/client/camera.hpp>

#include <thread>
#include <vector>
#include <set>
#include <fstream>
#include <filesystem>

namespace {
  constexpr auto delta = std::chrono::seconds{ 1 } / 20;
}

int main(int argc, const char** argv) {

  senshamart::Camera_info init_info;

  init_info.broker_endpoint = "tcp://127.0.0.1:5004";
  init_info.camera_sensor_name = "camera_sensor";
  init_info.gps_sensor_name = "gps_sensor";
  init_info.width = 1024;
  init_info.height = 768;

  senshamart::Camera client{ init_info };

  int in;
  
  senshamart::Clock::time_point now = senshamart::Clock::now();

  std::set<std::filesystem::path> image_paths;

  for(std::filesystem::directory_iterator directory_iter{ "C:\\users\\dekibeki\\documents\\png_02\\" };
    directory_iter != std::filesystem::directory_iterator{};
    ++directory_iter) {

    if(image_paths.size() > 100) {
      break;
    }
    image_paths.insert(directory_iter->path());
  }

  std::vector<cv::Mat> images;
  std::vector<char> temp;

  for(auto const& path : image_paths) {
    std::ifstream file{ path, std::ios_base::binary };
    while((in = file.get()) != std::ifstream::traits_type::eof()) {
      temp.push_back(static_cast<char>(in));
    }
    images.emplace_back(cv::imdecode(temp, cv::IMREAD_COLOR));
    temp.clear();
  }

  // Sending frames here
  fprintf(stderr, "Starting streaming\n");

  std::size_t frame_count = 0;

  for(;;) {
    for(auto& image : images) {
      fprintf(stderr, "Sending frame %zd\n", frame_count);
      client.add_frame(image);
      client.add_gps(senshamart::Latitude{ 0 }, senshamart::Longitude{ 0 }, 0);

      //std::this_thread::sleep_until(now + delta);
      now += delta;
      ++frame_count;
    }
    fprintf(stderr, "Repeating\n");
  }
}
