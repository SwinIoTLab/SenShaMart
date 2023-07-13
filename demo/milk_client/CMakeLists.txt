cmake_minimum_required (VERSION 3.8)

#Boost and openssl for https
find_package(Boost REQUIRED)

find_package(OpenSSL REQUIRED)

#rapidjson
find_package(RapidJSON CONFIG REQUIRED)

#spdlog
find_package(spdlog CONFIG REQUIRED)

#date
include( FetchContent )

FetchContent_Declare(date_src
  GIT_REPOSITORY https://github.com/HowardHinnant/date.git
  GIT_TAG        v3.0.0  # adjust tag/branch/commit as needed
)

SET(BUILD_TZ_LIB ON)
SET(USE_SYSTEM_TZ_DB ON)

FetchContent_MakeAvailable(date_src)

add_executable(etl
  "src/etl.cpp")

target_include_directories(etl PRIVATE
  ${RAPIDJSON_INCLUDE_DIRS})

target_link_libraries(etl PRIVATE
  ${OPENSSL_LIBRARIES}
  core
  spdlog::spdlog
  date::date
  senshamart_client)

IF(WIN32)
  target_compile_options(etl PRIVATE "/bigobj")
ENDIF()