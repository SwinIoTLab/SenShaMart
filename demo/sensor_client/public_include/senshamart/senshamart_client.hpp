#include <string>
#include <memory>

namespace senshamart {
  class Client final {
  public:
    Client(std::string broker_endpoint, std::string sensor_name);

    Client(Client const&) = delete;
    Client(Client&&) = default;

    Client& operator=(Client const&) = delete;
    Client& operator=(Client&&) = default;

    void send(std::string);
  private:
    struct Pimpl_deleter_ {
      void operator()(void*) const noexcept;
    };
    std::unique_ptr<void, Pimpl_deleter_> pimpl_;
  };
}