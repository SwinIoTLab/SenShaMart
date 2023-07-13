cmake_minimum_required (VERSION 3.8)

find_package(PahoMqttCpp CONFIG REQUIRED)

add_library(senshamart_client STATIC
  "src/senshamart_client.cpp")

target_include_directories(senshamart_client PUBLIC
  "public_include")

target_link_libraries(senshamart_client PRIVATE
  PahoMqttCpp::paho-mqttpp3)

target_compile_features(senshamart_client PUBLIC
	cxx_std_17)