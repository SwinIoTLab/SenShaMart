cmake_minimum_required (VERSION 3.8)

find_package(OpenCV REQUIRED)

find_package(PahoMqttCpp CONFIG REQUIRED)

include(FindFFmpeg.cmake)

add_executable(demo_show_video
  "src/demo_show_video.cpp")

target_include_directories(demo_show_video PUBLIC
  ${OpenCV_INCLUDE_DIRS}
	${FFMPEG_INCLUDE_DIRS})

target_link_libraries(demo_show_video PRIVATE
	${FFMPEG_LIBRARIES}
	${OpenCV_LIBRARIES}
	PahoMqttCpp::paho-mqttpp3)

target_compile_features(demo_show_video PUBLIC
	cxx_std_17)