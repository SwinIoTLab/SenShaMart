/*******************************************************************************
 * Copyright (c) 2021 Nerian Vision GmbH
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

#ifndef VISIONTRANSFER_PARAMETERTRANSFER_H
#define VISIONTRANSFER_PARAMETERTRANSFER_H

#include "visiontransfer/networking.h"
#include "visiontransfer/parameterinfo.h"

#include <map>

namespace visiontransfer {
namespace internal {

/**
 * \brief Allows a configuration of device parameters over the network.
 *
 * A TCP connection is established to a parameter server. The protocol
 * allows writing and reading of individual parameters, which are
 * identified by a unique ID. There are three supported types of
 * parameters: integers, double precision floating point values, and
 * booleans.
 *
 * This class is only used internally. Users should use the class
 * \ref DeviceParameters instead.
 */

class ParameterTransfer {
public:
    /**
     * \brief Creates an object and connects to the given server.
     *
     * \param address   IP address or host name of the server.
     * \param service   The port number that should be used as string or
     *                  as textual service name.
     */
    ParameterTransfer(const char* address, const char* service = "7683");
    ~ParameterTransfer();

    /**
     * \brief Reads an integer value from the parameter server.
     *
     * \param id    Unique ID of the parameter to be read.
     * \return      If successful, the value of the parameter that has
     *              been read
     *
     * If reading the parameter fails, then an exception of type
     * TransferException or ParameterException is thrown.
     */
    int readIntParameter(int32_t id);

    /**
     * \brief Reads a double precision floating point value from the
     * parameter server.
     *
     * \param id    Unique ID of the parameter to be read.
     * \return      If successful, the value of the parameter that has
     *              been read
     *
     * If reading the parameter fails, then an exception of type
     * TransferException or ParameterException is thrown.
     */
    double readDoubleParameter(int32_t id);

    /**
     * \brief Reads a boolean value from the parameter server.
     *
     * \param id    Unique ID of the parameter to be read.
     * \return      If successful, the value of the parameter that has
     *              been read
     *
     * If reading the parameter fails, then an exception of type
     * TransferException or ParameterException is thrown.
     */
    bool readBoolParameter(int32_t id);

    /**
     * \brief Writes an integer value to a parameter of the parameter
     * server.
     *
     * \param id    Unique ID of the parameter to be written.
     * \param value Value that should be written to the parameter.
     *
     * If writing the parameter fails, then an exception of type
     * TransferException or ParameterException is thrown.
     */
    void writeIntParameter(int32_t id, int32_t value);

    /**
     * \brief Writes a double precision floating point value to a
     * parameter of the parameter server.
     *
     * \param id    Unique ID of the parameter to be written.
     * \param value Value that should be written to the parameter.
     *
     * If writing the parameter fails, then an exception of type
     * TransferException or ParameterException is thrown.
     */
    void writeDoubleParameter(int32_t id, double value);

    /**
     * \brief Writes a boolean value to a parameter of the parameter
     * server.
     *
     * \param id    Unique ID of the parameter to be written.
     * \param value Value that should be written to the parameter.
     *
     * If writing the parameter fails, then an exception of type
     * TransferException or ParameterException is thrown.
     */
    void writeBoolParameter(int32_t id, int32_t value);

    /**
     * \brief Enumerates all parameters as reported by the device.
     */
    std::map<std::string, ParameterInfo> getAllParameters();

private:
    static constexpr int SOCKET_TIMEOUT_MS = 500;

    // Message types
    static constexpr unsigned char MESSAGE_READ_INT = 0x01;
    static constexpr unsigned char MESSAGE_READ_DOUBLE = 0x02;
    static constexpr unsigned char MESSAGE_READ_BOOL = 0x03;
    static constexpr unsigned char MESSAGE_WRITE_INT = 0x04;
    static constexpr unsigned char MESSAGE_WRITE_DOUBLE = 0x05;
    static constexpr unsigned char MESSAGE_WRITE_BOOL = 0x06;
    static constexpr unsigned char MESSAGE_ENUMERATE_PARAMS = 0x07;

    SOCKET socket;

    void checkProtocolVersion();
    void readParameter(unsigned char messageType, int32_t id, unsigned char* dest, int length);
    void recvData(unsigned char* dest, int length);

    template<typename T>
    void writeParameter(unsigned char messageType, int32_t id, T value);

    std::map<std::string, ParameterInfo> recvEnumeration();
};

}} // namespace

#endif
