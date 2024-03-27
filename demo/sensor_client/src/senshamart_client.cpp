#include <senshamart/senshamart_client.hpp>

#include <mqtt/async_client.h>

namespace {
  class Client_impl final : mqtt::callback {
  public:
    Client_impl(std::string broker_endpoint, std::string sensor_name) :
      mqtt_client_(std::move(broker_endpoint), sensor_name) {

      auto connOpts = mqtt::connect_options_builder()
        .keep_alive_interval(std::chrono::seconds(5))
        .automatic_reconnect(std::chrono::seconds(2), std::chrono::seconds(30))
        .clean_session(true)
        .finalize();

      mqtt_client_.connect(connOpts);

      video_topic_ = "in/" + sensor_name;
    }

    void send(std::string data) {
      auto msg = mqtt::make_message(video_topic_, std::move(data));
      msg->set_qos(0);
      msg->set_retained(false);

      try {
        mqtt_client_.
        mqtt_client_.publish(std::move(msg));
      } catch (mqtt::exception const& ex) {
#if _DEBUG
        fprintf(stderr, "Failed send: %s\n", ex.to_string().c_str());
#endif
      }
    }

    void close() {
      mqtt_client_.disconnect()->wait();
    }
    ~Client_impl() {
      close();
    }
  private:
    void connected(std::string const& cause) override {
#if _DEBUG
      fprintf(stderr, "Connected\n");
      if (!cause.empty()) {
        fprintf(stderr, "\tcause: %s\n", cause.c_str());
      }
#endif
    }

    void connection_lost(const std::string& cause) override {
#if _DEBUG
      fprintf(stderr, "Connection lost\n");
      if (!cause.empty()) {
        fprintf(stderr, "\tcause: %s\n", cause.c_str());
      }
#endif
    }

    void delivery_complete(mqtt::delivery_token_ptr tok) override {
#if _DEBUG
      fprintf(stderr, "Delivery complete for token: %d\n",
        (tok ? tok->get_message_id() : -1));
#endif
    }

    mqtt::async_client mqtt_client_;
    std::string video_topic_;
  };
}

senshamart::Client::Client(std::string broker_endpoint, std::string sensor_name) {
  Client_impl* const created = new Client_impl(std::move(broker_endpoint), std::move(sensor_name));
  pimpl_.reset(created);
}

void senshamart::Client::send(std::string sending) {
  static_cast<Client_impl*>(pimpl_.get())->send(std::move(sending));
}


void senshamart::Client::Pimpl_deleter_::operator()(void* p) const noexcept {
  delete static_cast<Client_impl*>(p);
}