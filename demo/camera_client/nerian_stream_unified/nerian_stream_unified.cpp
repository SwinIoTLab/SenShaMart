/*******************************************************************************
 * Copyright (c) 2021 Nerian Vision GmbH
 * Copyright (c) 2022 Swinburne University of Technology
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *******************************************************************************/

#include <opencv2/opencv.hpp>

 // PCL headers must be included first!
#include <pcl/pcl_base.h>
#include <pcl/point_types.h>
#include <pcl/io/pcd_io.h>
#include <pcl/filters/extract_indices.h>

#include <visiontransfer/deviceenumeration.h>
#include <visiontransfer/asynctransfer.h>
#include <visiontransfer/imageset.h>
#include <visiontransfer/reconstruct3d.h>
#include <iostream>
#include <exception>
#include <stdio.h>

#include <senshamart/client/camera.hpp>
#include <thread>
#include <chrono>

#include <unistd.h>

#include <netinet/in.h>


#ifdef _MSC_VER
// Visual studio does not come with snprintf
#define snprintf _snprintf_s
#endif

using namespace visiontransfer;
namespace {
  constexpr auto delta = std::chrono::seconds{ 1 } / 25;
}


int main(int argc, const char** argv) {

  if (argc < 4) {
    fprintf(stderr, "Expected %s <broker endpoint> <camera sensor name> <gps sensor name>\n", argv[0]);
    return -1;
  }

  const char* const broker_endpoint = argv[1];
  const char* const camera_sensor_name = argv[2];
  const char* const gps_sensor_name = argv[3];

  // Init AWS Code
  senshamart::Camera_info init_info;

  // Name, same as the KVS cloud. It is the hostname.
  init_info.width = 1024;
  init_info.height = 768;

  init_info.broker_endpoint = broker_endpoint;
  init_info.camera_sensor_name = camera_sensor_name;
  init_info.gps_sensor_name = gps_sensor_name;


  senshamart::Camera camera{ init_info };

  int in;

  senshamart::Clock::time_point now = senshamart::Clock::now();

  std::cout << "[Nerian] Initialisation done" << std::endl;


  // UDP socket to receive GNSS data
  int sockfd, n;
  struct sockaddr_in servaddr, cliaddr;
  socklen_t len;
  char gnssCoord[35] = "-0,-0,-0"; // Weird initialisation to indicate there is no GNSS data

  sockfd = socket(AF_INET, SOCK_DGRAM, 0);

  servaddr.sin_family = AF_INET;
  servaddr.sin_addr.s_addr = htonl(INADDR_ANY);
  servaddr.sin_port = htons(32100);
  bind(sockfd, (struct sockaddr*)&servaddr, sizeof(servaddr));


  try {
    // Search for Nerian stereo devices
    DeviceEnumeration deviceEnum;
    DeviceEnumeration::DeviceList devices = deviceEnum.discoverDevices();
    int cameraWaitingCycles = 0;
    while (devices.size() == 0) {
      // GG is shit because it does not restart services if they fail more than 3 times.
      printf("[Nerian] No devices discovered! Waiting 0.5s and trying again. Total waiting time: %.1f seconds.\n", cameraWaitingCycles * 0.5);
      std::this_thread::sleep_for(std::chrono::milliseconds(500));
      devices = deviceEnum.discoverDevices();
      cameraWaitingCycles++;
      //return -1;
    }

    // Print devices
    std::cout << "[Nerian] Discovered devices:" << std::endl;
    for (unsigned int i = 0; i < devices.size(); i++) {
      std::cout << "[Nerian] " << devices[i].toString() << std::endl;
    }
    std::cout << std::endl;

    // Create an image transfer object that receives data from the first detected device
    // and get the status of the camera
    AsyncTransfer asyncTransfer(devices[0]);
    auto status = devices[0].getStatus();

    // Variables to calculate fps
    std::chrono::time_point<std::chrono::system_clock> timeNewFrame, timeOldFrame;

    // Receive and send images
    while (true) {

      // GNSS stuff
      len = sizeof(cliaddr);
      n = recvfrom(sockfd, gnssCoord, 35, MSG_DONTWAIT, (struct sockaddr*)&cliaddr, &len);
      if (n > 0) {
        gnssCoord[n] = 0;
        printf("[GNSS] Received the following: ");
        printf("%s", gnssCoord);

        std::stringstream ss;
        ss << gnssCoord;

        std::string lat, lon, speed;
        getline(ss, lat, ',');
        getline(ss, lon, ',');
        getline(ss, speed, ',');
        printf("[Nerian] Sending GPS and Speed: %lf %lf %lf \n", std::stod(lat), std::stod(lon), std::stod(speed));
        camera.add_gps(senshamart::Latitude{std::stod(lat)}, senshamart::Longitude{std::stod(lon)}, std::stod(speed));
      } else {
        printf("[Nerian] Not sending GPS and Speed\n");
      }

      // Receive image
      ImageSet imageSet;
      while (!asyncTransfer.collectReceivedImageSet(imageSet, 0.1 /*timeout*/)) {
        // FIXME: Blocking code that we are not logging/handling. It needs testing
        // Keep on trying until reception is successful
      }

      // Compute frame rate
      timeOldFrame = timeNewFrame;
      timeNewFrame = std::chrono::system_clock::now();
      std::chrono::duration<double> elapsedSeconds = timeNewFrame - timeOldFrame;
      std::cout << "[Nerian] Receiving image set at " << 1 / elapsedSeconds.count() << " fps" << std::endl;

      // Nerian Camera Stuff
        // Write only image 1, so we don't care about the other images. The other images are disparity maps
        // Sending frames here
      cv::Mat convertedImage;
      imageSet.toOpenCVImage(0, convertedImage);  // Converting image 0 which is RGB
      camera.add_frame(convertedImage);           // Sending RGB image in cv::Mat format

      std::this_thread::sleep_until(now + delta);
      now += delta;
    }
  } catch (const std::exception& ex) {
    std::cerr << "Exception occurred: " << ex.what() << std::endl;
  }

  return 0;
}
