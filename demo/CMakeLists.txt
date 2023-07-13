cmake_minimum_required (VERSION 3.8)

SET(CMAKE_POLICY_DEFAULT_CMP0077 NEW)

project("senshamart demo" C CXX)

if(EXISTS "sensor_client")
  add_subdirectory("sensor_client")
endif()
if(EXISTS "milk_client")
  add_subdirectory("milk_client")
endif()
if(EXISTS "camera_client")
  add_subdirectory("camera_client")
endif()
if(EXISTS "demo_show_video")
  add_subdirectory("demo_show_video")
endif()