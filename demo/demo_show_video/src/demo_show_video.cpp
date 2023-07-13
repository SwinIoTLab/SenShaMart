#include <cstdio>
#include <vector>
#include <deque>
#include <fstream>
#include <thread>

#include <opencv2/opencv.hpp>

#include "mqtt/client.h"

int main(int argc, const char** argv) {
  if (argc <= 3) {
    fprintf(stderr, "Expected %s <header location> <broker location> <channel name>\n", argv[0]);
    return -1;
  }

  const char* const header_location = argv[1]; //"C:\\users\\dekibeki\\work\\video_header";// 
  const char* const broker_location = argv[2]; //"tcp://136.186.108.94:5004";// 
  const char* const channel_name = argv[3]; //"out/873304a31447291aa9a701bfdfb7076f35f070a7a1473521610bfa6a77858569/0";//


  int in = 0;
  std::vector<char> header;
  std::ifstream file{ header_location, std::ios_base::binary };
  while ((in = file.get()) != std::ifstream::traits_type::eof()) {
    header.push_back(static_cast<std::uint8_t>(in));
  }

  if (header.empty()) {
    fprintf(stderr, "Empty/non-existent header at `%s`", header_location);
    return -1;
  }

  mqtt::client mqtt_client(broker_location, "demo show video");

  auto connOpts = mqtt::connect_options_builder()
    .keep_alive_interval(std::chrono::seconds(30))
    .automatic_reconnect(std::chrono::seconds(2), std::chrono::seconds(30))
    .clean_session(false)
    .finalize();

  for (;;) {
    mqtt::connect_response rsp = mqtt_client.connect(connOpts);

    if (!rsp.is_session_present()) {
      mqtt_client.subscribe(channel_name);
    }

    for (std::size_t i = 0;;++i) {
      auto msg = mqtt_client.consume_message();

      if (msg) {
        fprintf(stderr, "New segment: %zd\n", i);
        const mqtt::string data = msg->to_string();
        FILE* temp_file = fopen("./test.webm", "wb");
        fwrite(header.data(), 1, header.size(), temp_file);
        fwrite(data.data(), 1, data.size(), temp_file);
        fclose(temp_file);

        cv::VideoCapture reader("./test.webm");

        cv::Mat frame;

        while (reader.read(frame)) {
          cv::imshow(channel_name, frame);
          cv::waitKey(1000 / 5);
        }

      } else if (!mqtt_client.is_connected()) {
        fprintf(stderr, "No connection, sleeping\n");
        while (!mqtt_client.is_connected()) {
          std::this_thread::sleep_for(std::chrono::milliseconds(250));
        }
        fprintf(stderr, "Reconnected\n");
      }
    }
  }
}