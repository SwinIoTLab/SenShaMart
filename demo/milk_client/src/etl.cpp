#include <boost/asio/io_service.hpp>
#include <boost/asio/deadline_timer.hpp>
#include <boost/beast.hpp>
#include <boost/beast/ssl.hpp>
#include <memory>
#include <optional>
#include <unordered_map>
#include <string_view>
#include <sstream>
#include <rapidjson/document.h>
#include <date/date.h>

#include <spdlog/spdlog.h>
#include <spdlog/sinks/rotating_file_sink.h>
#include <spdlog/sinks/stdout_sinks.h>

#include <senshamart/senshamart_client.hpp>

namespace {

  using Clock = std::chrono::system_clock;

  char to_base64_char(char c) {
    assert(c >= 0 && c < 64);

    constexpr std::array<char, 64> conversion_table = {
      'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
      'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z',
      '0','1','2','3','4','5','6','7','8','9','+','/' };

    return conversion_table[c];
  }

  std::string to_base64(boost::string_view str) {
    std::string returning;
    const std::size_t len = str.size() * 8;

    char cur_sextet = 0;
    std::size_t sextet_size = 0;

    for (std::size_t i = 0; i < str.size(); ++i) {
      for (std::size_t j = 0; j < CHAR_BIT; ++j) {
        cur_sextet <<= 1;
        cur_sextet |= (str[i] >> (CHAR_BIT - j - 1)) & 0x01;
        sextet_size++;
        if (sextet_size == 6) {
          returning.push_back(to_base64_char(cur_sextet));
          cur_sextet = 0;
          sextet_size = 0;
        }
      }
    }

    if (sextet_size != 0) {
      returning.push_back(to_base64_char(cur_sextet << (6 - sextet_size)));
      if (sextet_size == 4) {
        returning.push_back('=');
      } else if (sextet_size == 2) {
        returning.push_back('=');
        returning.push_back('=');
      }
    }

    return returning;
  }

  std::string as_string(Clock::time_point time) noexcept {
    return date::format("%FT%TZ", date::floor<std::chrono::milliseconds>(time));
  }

  std::optional<Clock::time_point> from_string(std::string const& str) noexcept {
    int year = 0;
    unsigned int month = 0;
    unsigned int day = 0;
    unsigned int hour = 0;
    unsigned int minute = 0;
    unsigned int second = 0;
    unsigned int milliseconds = 0;

    int read_count = 0;

    if (sscanf(str.c_str(), "%d-%u-%uT%u:%u:%u.%3uZ%n",
      &year, &month, &day, &hour, &minute, &second, &milliseconds, &read_count) != 7
      || read_count != str.size()) {
      return std::nullopt;
    }

    const auto y_m_d = date::year_month_day{
    date::year{ static_cast<int>(year) },
    date::month{ month },
    date::day{ day } };
    const auto time =
      std::chrono::hours{ hour }
      + std::chrono::minutes{ minute }
      + std::chrono::seconds{ second }
    + std::chrono::milliseconds{ milliseconds };

    return std::chrono::time_point_cast<std::chrono::system_clock::duration>(y_m_d.operator date::sys_days() + time);
  }

  struct Decoded_type {
    std::string_view type;
    std::string_view sensor;
    std::string_view connection_type;
    std::string_view interface;
  };

  template<typename It1, typename It2>
  std::string_view make_string_view(It1 begin, It2 end) {
    return std::string_view{ &*begin, static_cast<std::size_t>(std::distance(begin, end)) };
  }

  std::optional<Decoded_type> decode_type(std::string_view type) {
    const auto first_space = std::find(type.begin(), type.end(), ' ');
    if (first_space == type.end()) {
      return std::nullopt;
    }
    const auto second_space = std::find(first_space + 1, type.end(), ' ');
    if (second_space == type.end()) {
      return std::nullopt;
    }
    const auto third_space = std::find(second_space + 1, type.end(), ' ');
    if (third_space == type.end()) {
      return std::nullopt;
    }
    //make sure we only have 3 spaces
    if (std::find(third_space + 1, type.end(), ' ') != type.end()) {
      return std::nullopt;
    }

    Decoded_type returning;
    returning.type = make_string_view(type.begin(), first_space);
    returning.sensor = make_string_view(first_space + 1, second_space);
    returning.connection_type = make_string_view(second_space + 1, third_space);
    returning.interface = make_string_view(third_space + 1, type.end());

    return returning;
  }

  //cumulocity stuff

  const auto data_refresh_period = boost::posix_time::seconds{ 10 };
  const auto reconnect_period = boost::posix_time::minutes{ 1 };
  const auto resend_period = boost::posix_time::minutes{ 5 };

  struct Send_info {
    senshamart::Client* sending_to;
    std::string sending;
  };

  struct Refresh_info {
    std::int64_t iot_device_id;
    Clock::time_point last_read_time;
  };

  struct Cumulocity_requester :
    public std::enable_shared_from_this<Cumulocity_requester> {
  public:
    Cumulocity_requester(
      boost::asio::io_service& io,
      senshamart::Client external_temp_sensor,
      senshamart::Client external_humidity_sensor,
      senshamart::Client milk_temp_sensor,
      senshamart::Client milk_level_sensor,
      std::string_view host,
      boost::asio::ssl::context& ctx,
      const char* username,
      const char* password,
      spdlog::logger& undecodable,
      spdlog::logger& log,
      std::int64_t device_id) :
      sending_(),
      recv_buffer_(),
      recv_response_(),
      io_(io),
      ctx_(ctx),
      location_(),
      socket_(io, ctx),
      host_(host.data(), host.size()),
      target_endpoint_(),
      reconnect_timer_(io),
      refresh_timer_(io),
      resend_timer_(io),
      external_temp_sensor_(std::move(external_temp_sensor)),
      external_humidity_sensor_(std::move(external_humidity_sensor)),
      milk_temp_sensor_(std::move(milk_temp_sensor)),
      milk_level_sensor_(std::move(milk_level_sensor)),
      undecodable_(undecodable),
      log_(log) {

      boost::asio::ip::tcp::resolver resolver(io);

      auto resolved = resolver.resolve(host_, "443");

      if (resolved == boost::asio::ip::tcp::resolver::iterator()) {
        log_.critical("Could not resolve host\n");
        throw "Could not resolve host\n";
      }

      target_endpoint_ = *resolved;

      std::string combined;
      combined.append(username);
      combined.push_back(':');
      combined.append(password);

      auth_ = "Basic ";
      auth_.append(to_base64(combined));

      refresh_info_.iot_device_id = device_id;
      refresh_info_.last_read_time = Clock::now();

    }

    void start() {
      refresh_();
      set_resend_timer_();
    }

  private:
    void set_reconnect_timer_() {
      reconnect_timer_.expires_from_now(reconnect_period);
      reconnect_timer_.async_wait([me = this->shared_from_this()](boost::system::error_code ec) {
        if (!ec) {
          me->reconnect_();
        }
      });
    }

    void reconnect_() {
      socket_.async_shutdown([me = this->shared_from_this()](boost::system::error_code ec) {
        me->socket_.next_layer().close();
        me->socket_ = boost::beast::ssl_stream<boost::beast::tcp_stream>{me->io_, me->ctx_};
        me->socket_.next_layer().async_connect(me->target_endpoint_,
          [me](boost::system::error_code ec) {
            if (ec) {
              me->set_reconnect_timer_();
            } else {
              //successful reconnect
              me->socket_.async_handshake(boost::asio::ssl::stream_base::handshake_type::client,
                [me](boost::system::error_code ec) {
                  if (ec) {
                    me->set_reconnect_timer_();
                  } else {
                    //successful handshake
                    me->do_refresh_();
                  }
                });
            }
          });
      });
    }

    void refresh_() {
      log_.info("refreshing");
      do_refresh_();
    }

    void do_refresh_() {
      //clear prev state
      resend_info_.clear();
      //generate request
      sending_.method(boost::beast::http::verb::get);
      sending_.version(11);
      std::stringstream building_target;
      building_target << "/measurement/measurements?source=" << refresh_info_.iot_device_id
        << "&dateFrom=" << as_string(refresh_info_.last_read_time)
        << "&pageSize=5000";
      log_.info("Refreshing with target: '{}'", building_target.str());
      sending_.target(building_target.str());
      sending_.keep_alive(true);
      sending_.set(boost::beast::http::field::host, host_);
      sending_.set(boost::beast::http::field::authorization, auth_);

      recv_buffer_.clear();
      recv_response_.body().clear();

      boost::beast::http::async_write(socket_, sending_,
        [me = this->shared_from_this()](boost::system::error_code ec, std::size_t n) {
        if (ec) {
          me->log_.warn("Couldn't write to cumulocity: {}", ec.message());
          me->reconnect_();
        } else {
          boost::beast::http::async_read(me->socket_, me->recv_buffer_, me->recv_response_,
            [me](boost::system::error_code ec, std::size_t n) {
              if (ec) {
                me->log_.warn("Couldn't read from cumulocity: {}", ec.message());
                me->reconnect_();
              } else {
                me->do_recv_();
              }
            });
        }
      });
      //send
    }

    void recv_measurement_(rapidjson::Value const& measurement) {
      const auto now = Clock::now();
      const auto upper_limit = now + std::chrono::hours{ 24 * 7 };
      
      if (!measurement.IsObject()) {
        return;
      }
      const auto found_id = measurement.FindMember("id");
      if (found_id == measurement.MemberEnd()) {
        log_.warn("Member id not found");
        return;
      }
      if(!found_id->value.IsString()) {
        log_.warn("Member id is not a string");
        return;
      }
      const int64_t id_as_int = atoll(found_id->value.GetString());

      const auto found_time = measurement.FindMember("time");
      if(found_time == measurement.MemberEnd()) {
        log_.warn("Member time is not found");
        return;
      }
      if(!found_time->value.IsString()) {
        log_.warn("Member time is not a string");
        return;
      }
      const auto time_val = from_string(found_time->value.GetString());
      if (!time_val.has_value()) {
        log_.warn("Couldn't parse time: {}", found_time->value.GetString());
        return;
      }

      //if over 48 hours into the future, ignore
      if (time_val.value() > std::chrono::system_clock::now() + std::chrono::hours{48}) {
        return;
      }

      refresh_info_.last_read_time = std::max(refresh_info_.last_read_time, time_val.value());

      for (auto measurement_iter = measurement.MemberBegin(); measurement_iter != measurement.MemberEnd(); ++measurement_iter) {
        
        //if we are metadata, skip
        
        if (!measurement_iter->name.IsString() || !measurement_iter->value.IsObject()) {
          continue;
        }
        const std::string_view fragment_name{ measurement_iter->name.GetString(), measurement_iter->name.GetStringLength() };
        if (fragment_name == "id") {
          continue;
        } else if (fragment_name == "self") {
          continue;
        } else if (fragment_name == "time") {
          continue;
        } else if (fragment_name == "type") {
          continue;
        } else if (fragment_name == "source") {
          continue;
        }

        //we aren't the metadata, we are a fragment

        auto const& fragment = measurement_iter->value;

        for (auto fragment_iter = fragment.MemberBegin(); fragment_iter != fragment.MemberEnd(); ++fragment_iter) {
          if (!fragment_iter->name.IsString()) {
            continue;
          }
          if (!fragment_iter->value.IsObject()) {
            continue;
          }

          auto const& reading = fragment_iter->value;

          const auto found_unit = reading.FindMember("unit");
          if(found_unit == reading.MemberEnd() || !found_unit->value.IsString()) {
            continue;
          }
          const auto found_value = reading.FindMember("value");
          if (found_value == reading.MemberEnd() || !found_value->value.IsNumber()) {
            continue;
          }

          const std::string_view unit{ found_unit->value.GetString(), found_unit->value.GetStringLength() };

          const double value = found_value->value.GetDouble();

          //if we can't decode fragment name, log it, and skip
          const auto decoded_type = decode_type(fragment_name);

          if (!decoded_type.has_value()) {
            undecodable_.warn("time, fragment name, unit, device id, id, value = {}, {}, {}, {}, {}, {}",
              std::string_view{found_time->value.GetString(), found_time->value.GetStringLength()},
              std::string_view{ fragment_name.data(), fragment_name.size() },
              std::string_view{ unit.data(), unit.size() },
              refresh_info_.iot_device_id,
              id_as_int,
              value);
            continue;
          }

          if(time_val.value() >= upper_limit) {
            //we have a problem with devices returning bogus timestamps in 2035, this will stop those
            continue;
          }

          senshamart::Client* sending_to = nullptr;

          if (decoded_type->type == "Farm_condition_temperature") {
            sending_to = &this->external_temp_sensor_;
          } else if (decoded_type->type == "Milk_quantity") {
            sending_to = &this->milk_level_sensor_;
          } else if (decoded_type->type == "Milk_temperature") {
            sending_to = &this->milk_temp_sensor_;
          } else if (decoded_type->type == "Farm_condition_humidity") {
            sending_to = &this->external_humidity_sensor_;
          }

          if (sending_to == nullptr) {
            log_.info("Unused sensor value for {}", decoded_type->type);
          } else {
            std::stringstream sending;
            sending <<
              "{"
              "\"time\":\"" << found_time->value.GetString() << "\","
              "\"value\":" << value <<
              "}";
            resend_info_.push_back(Send_info{
              sending_to,
              sending.str() });
          }
        }
      }
    }

    void do_recv_() {
      //read request
      do {
        if (recv_response_.result() != boost::beast::http::status::ok) {
          break;
        }

        rapidjson::Document body;
        if (body.Parse(recv_response_.body().c_str()).HasParseError()) {
          break;
        }

        if (!body.IsObject()) {
          break;
        }

        if (!body.HasMember("measurements")) {
          break;
        }

        rapidjson::Value const& measurement_array = body["measurements"];

        if (!measurement_array.IsArray()) {
          break;
        }

        rapidjson::Value::ConstArray as_array = measurement_array.GetArray();

        for (auto const& element : as_array) {
          recv_measurement_(element);
        }
      } while (false);

      for (auto const& sending : resend_info_) {
        sending.sending_to->send(sending.sending);
      }

      set_timer_();
    }

    void set_timer_() {
      refresh_timer_.expires_from_now(data_refresh_period);
      refresh_timer_.async_wait([me = this->shared_from_this()](boost::system::error_code ec) {
        if (!ec) {
          me->refresh_();
        }
      });
    }

    void set_resend_timer_() {
      resend_timer_.expires_from_now(resend_period);
      resend_timer_.async_wait([me = this->shared_from_this()](boost::system::error_code ec) {
        if (!ec) {
          me->resend_();
        }
        });
    }

    void resend_() {

      for (auto const& resending : resend_info_) {
        resending.sending_to->send(resending.sending);
      }

      set_resend_timer_();
    }

    boost::beast::http::request<boost::beast::http::empty_body> sending_;
    boost::beast::flat_buffer recv_buffer_;
    boost::beast::http::response<boost::beast::http::string_body> recv_response_;

    boost::asio::io_service& io_;
    boost::asio::ssl::context& ctx_;

    boost::beast::tcp_stream::endpoint_type location_;
    boost::beast::ssl_stream<boost::beast::tcp_stream> socket_;
    boost::asio::ip::tcp::endpoint target_endpoint_;
    std::string host_;
    boost::asio::deadline_timer reconnect_timer_;
    boost::asio::deadline_timer refresh_timer_;
    boost::asio::deadline_timer resend_timer_;
    std::vector<Send_info> resend_info_;
    std::string auth_;

    Refresh_info refresh_info_;
    senshamart::Client external_temp_sensor_;
    senshamart::Client external_humidity_sensor_;
    senshamart::Client milk_temp_sensor_;
    senshamart::Client milk_level_sensor_;
    spdlog::logger& undecodable_;
    spdlog::logger& log_;
  };
}

int main(int argc, const char** argv) {
  if (argc < 12) {
    fprintf(stderr, "Expected"
      " %s"
      " <cumulocity host>"
      " <cumulocity username>"
      " <cumulocity password>"
      " <broker location>"
      " <cumulocity device id>"
      " <external temp sensor name>"
      " <external humidity sensor name>"
      " <milk temp sensor name>"
      " <milk level sensor name>"
      " <log location>"
      " <undecoded log>\n", argv[0]);
    return -1;
  }

  const char* host = argv[1]; //"bega.apj.cumulocity.com";//
  const char* username = argv[2]; //"jkaraboticmilovac@swin.edu.au";//
  const char* password = argv[3]; //"swin.iotLab";//
  const char* broker_location = argv[4]; //"tcp://127.0.0.1:8001";//
  const char* cumulocity_device_id_str = argv[5];
  const char* external_temp_sensor_name = argv[6];
  const char* external_humidity_sensor_name = argv[7];
  const char* milk_temp_sensor_name = argv[8];
  const char* milk_level_sensor_name = argv[9];
  const char* log_location = argv[10]; //"etl_log";//
  const char* undecodable_location = argv[11]; //"undecodable.log";//

  const auto undecodable_file_sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
    undecodable_location, 4 * 1024 * 1024, 4, true);
  const auto log_file_sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
    log_location, 4 * 1024 * 1024, 4, true);
  const auto stderr_sink = std::make_shared<spdlog::sinks::stderr_sink_mt>();

  spdlog::logger undecodable{ "undecodable", { undecodable_file_sink, log_file_sink, stderr_sink } };
  spdlog::logger log{ "etl", { log_file_sink, stderr_sink } };
  log.info("initing");

  //milk supply chain monitoring system side

  senshamart::Client external_temp_sensor{broker_location, external_temp_sensor_name};
  senshamart::Client external_humidity_sensor{broker_location, external_humidity_sensor_name};
  senshamart::Client milk_temp_sensor{broker_location, milk_temp_sensor_name};
  senshamart::Client milk_level_sensor{broker_location, milk_level_sensor_name};

  //cumulocity side stuff

  boost::asio::io_service io;

  boost::asio::ssl::context ctx(boost::asio::ssl::context_base::tls_client);
  ctx.set_verify_callback([](auto&&...) {return true; });

  const std::int64_t device_id =  std::strtoll(cumulocity_device_id_str, nullptr, 10);

  const auto cumulocity_requester = std::make_shared<Cumulocity_requester>(
    io,
    std::move(external_temp_sensor),
    std::move(external_humidity_sensor),
    std::move(milk_temp_sensor),
    std::move(milk_level_sensor),
    host,
    ctx,
    username,
    password,
    undecodable,
    log,
    device_id);

  log.info("starting");

  cumulocity_requester->start();

  io.run();

  return 0;
}