#pragma once

#include <cstddef>
#include <chrono>
#include <utility>
#include <memory>
#include <string>
#include <optional>
#include <opencv2/opencv.hpp>

namespace senshamart {
  using Clock = std::chrono::system_clock;

  //strong type for latitude
  struct Latitude {
    double val;
  };

  //strong type for longitude
  struct Longitude {
    double val;
  };

  struct Camera_info {

    std::size_t width;
    std::size_t height;
    std::string broker_endpoint;
    std::string camera_sensor_name;
    std::string gps_sensor_name;
  };

  class Camera final {
  public:
    //init with the init info, may throw if there's an error. width and height are the resolution of the expected frames
    Camera(Camera_info const&);

    Camera(Camera const&) = delete;
    Camera(Camera&&) = default;

    Camera& operator=(Camera const&) = delete;
    Camera& operator=(Camera&&) = default;

    //add a frame, expects it raw
    //will check to see if frame is expected size to match resolution in constructor
    void add_frame(void* data, std::size_t size);
    //add a frame, expects it raw
    //will check to see if frame is expected size to match resolution in constructor
    void add_frame(void* data, std::size_t size, Clock::time_point time);

    //add a frame, expects it raw, helper to automatically add time
    //will check to see if frame is expected size to match resolution in constructor
    void add_frame(cv::Mat const& frame);
    //add a frame, expects it raw
    //will check to see if frame is expected size to match resolution in constructor
    void add_frame(cv::Mat const& frame, Clock::time_point time);

    //adds the gps location and speed, helper to automatically add time
    template<typename First, typename Second>
    void add_gps(First&& first, Second&& second, double speed) {
      add_gps(std::forward<First>(first), std::forward<Second>(second), speed, Clock::now());
    }
    //adds the gps location and speed
    void add_gps(Latitude latitude, Longitude longitude, double speed, Clock::time_point time);
    void add_gps(Longitude longitude, Latitude latitude, double speed, Clock::time_point time);

  private:
    struct Pimpl_deleter_ {
      void operator()(void*) const noexcept;
    };
    std::unique_ptr<void, Pimpl_deleter_> pimpl_;
  };
}

