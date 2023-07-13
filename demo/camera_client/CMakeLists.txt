# CMakeList.txt : CMake project for brimbank, include source and define
# project specific logic here.
#
cmake_minimum_required (VERSION 3.8)

SET(CMAKE_POLICY_DEFAULT_CMP0077 NEW)

project("senshamart" C CXX)

find_package(OpenCV REQUIRED)

if(NOT WIN32)
	add_subdirectory("dependencies/libvisiontransfer")
endif()

include(FindFFmpeg.cmake)

find_package(PCL 1.3 COMPONENTS common io filters)
if(PCL_FOUND)
    include_directories(${PCL_INCLUDE_DIRS})
    link_directories(${PCL_LIBRARY_DIRS})
    add_definitions(${PCL_DEFINITIONS})
else()
    message(WARNING "nerian_stream_pc_aws will crash!")
endif()


# Add source to this project's executable.
add_library(camera_demo_client STATIC
	"src/camera.cpp")

target_include_directories(camera_demo_client PRIVATE
	"private_include"
	${FFMPEG_INCLUDE_DIRS})

target_include_directories(camera_demo_client PUBLIC
	"public_include"
  ${OpenCV_INCLUDE_DIRS})

target_link_libraries(camera_demo_client PRIVATE
	${FFMPEG_LIBRARIES}
	${OpenCV_LIBRARIES}
	senshamart_client)

target_compile_features(camera_demo_client PUBLIC
	cxx_std_17)

add_executable(camera_demo_client_scratch
  "scratch/scratch.cpp")

target_include_directories(camera_demo_client_scratch PRIVATE
	${OpenCV_INCLUDE_DIRS}
	${FFMPEG_INCLUDE_DIRS}
)

target_link_libraries(camera_demo_client_scratch PRIVATE
	camera_demo_client
	${OpenCV_LIBRARIES}
	${FFMPEG_LIBRARIES}
  )


if(NOT WIN32)
	add_executable(camera_demo
		"nerian_stream_unified/nerian_stream_unified.cpp")

	target_include_directories(camera_demo  PRIVATE
		${OpenCV_INCLUDE_DIRS}
		${FFMPEG_INCLUDE_DIRS}
	)

	target_link_libraries(camera_demo PRIVATE
		camera_demo_client
		${OpenCV_LIBRARIES}
		${FFMPEG_LIBRARIES}
		${LIB_SUFFIX} ${PCL_COMMON_LIBRARIES} ${PCL_IO_LIBRARIES} ${PCL_FILTERS_LIBRARIES} ${EXTRA_LIBS}
		visiontransfer${LIB_SUFFIX})
endif()