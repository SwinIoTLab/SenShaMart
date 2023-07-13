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

#include <iostream>

#include "visiontransfer/parametertransfer.h"
#include "visiontransfer/exceptions.h"
#include "visiontransfer/internalinformation.h"
#include "visiontransfer/standardparameterids.h"
#include "visiontransfer/parametertransferdata.h"
#include <cstring>
#include <string>

using namespace std;
using namespace visiontransfer;
using namespace visiontransfer::internal;

namespace visiontransfer {
namespace internal {

constexpr int ParameterTransfer::SOCKET_TIMEOUT_MS;

ParameterTransfer::ParameterTransfer(const char* address, const char* service)
    : socket(INVALID_SOCKET) {

    Networking::initNetworking();
    addrinfo* addressInfo = Networking::resolveAddress(address, service);

    socket = Networking::connectTcpSocket(addressInfo);
    Networking::setSocketTimeout(socket, SOCKET_TIMEOUT_MS);
    checkProtocolVersion();

    freeaddrinfo(addressInfo);
}

ParameterTransfer::~ParameterTransfer() {
    if(socket != INVALID_SOCKET) {
        Networking::closeSocket(socket);
    }
}

std::map<std::string, ParameterInfo> ParameterTransfer::recvEnumeration() {
    std::map<std::string, ParameterInfo> pi;
    const size_t bufsize = 4096;
    char buf[bufsize];
    char* recv_buf = buf;

    int bytesReceived = recv(socket, recv_buf, 4, 0);
    if(bytesReceived < 0) {
        TransferException ex("Error receiving network packet: " + string(strerror(errno)));
        throw ex;
    } else if (bytesReceived == 0) {
        TransferException ex("Error receiving network packet: connection closed");
        throw ex;
    } else if (bytesReceived < 4) {
        TransferException ex("Error receiving parameter enumeration - no length!");
        throw ex;
    }
    recv_buf += 4;

    // Number of parameters in the first received uint32
    uint32_t num_params = ntohl(reinterpret_cast<uint32_t*>(buf)[0]);
    // Expected size of following data block, read until met
    size_t expected_remaining_size = num_params * sizeof(TransportParameterInfo);
    if (expected_remaining_size > bufsize - 4) {
        TransferException ex("Remote parameter enumeration exceeds expected maximum size");
        throw ex;
    }
    while (expected_remaining_size > 0) {
        bytesReceived = recv(socket, recv_buf, expected_remaining_size, 0);
        if (bytesReceived < 0) {
            TransferException ex("Error receiving network packet: " + string(strerror(errno)));
            throw ex;
        } else if (bytesReceived == 0) {
            TransferException ex("Error receiving network packet: connection closed");
            throw ex;
        } else {
            expected_remaining_size -= bytesReceived;
            recv_buf += bytesReceived;
        }
    }

    TransportParameterInfo* tpi = reinterpret_cast<TransportParameterInfo*>(buf + 4);
    for (unsigned int i = 0; i < num_params; ++i) {
        StandardParameterIDs::ParameterID id = (StandardParameterIDs::ParameterID) ntohl(tpi->id);
        ParameterInfo::ParameterType type = (ParameterInfo::ParameterType) ntohl(tpi->type);
        bool writeable = ntohl(tpi->flags & StandardParameterIDs::ParameterFlags::PARAMETER_WRITEABLE) != 0;
        //
        auto nameIt = internal::StandardParameterIDs::parameterNameByID.find(id);
        if (nameIt == StandardParameterIDs::parameterNameByID.end()) {
            std::cerr << "Enumeration contained a ParameterID for which no name is known: " << std::to_string(id) << std::endl;
            std::cerr << "Parameter ignored; please ensure your libvisiontransfer is up to date." << std::endl;
        } else {
            switch(type) {
                case ParameterInfo::TYPE_INT: {
                        pi[nameIt->second] = visiontransfer::ParameterInfo::fromInt(nameIt->second, writeable,
                                    ntohl(tpi->value.intVal), ntohl(tpi->min.intVal), ntohl(tpi->max.intVal), ntohl(tpi->inc.intVal)
                                    );
                        break;
                    }
                case ParameterInfo::TYPE_BOOL: {
                        pi[nameIt->second] = visiontransfer::ParameterInfo::fromBool(nameIt->second, writeable, ntohl(tpi->value.boolVal) != 0);
                        break;
                    }
                case ParameterInfo::TYPE_DOUBLE: {
                        pi[nameIt->second] = visiontransfer::ParameterInfo::fromDouble(nameIt->second, writeable,
                                    tpi->value.doubleVal, tpi->min.doubleVal, tpi->max.doubleVal, tpi->inc.doubleVal
                                    );
                        break;
                    }
                default: {
                    }
            }
        }
        ++tpi;
    }
    return pi;
}

void ParameterTransfer::recvData(unsigned char* dest, int length) {
    int bytesReceived = recv(socket, reinterpret_cast<char*>(dest), length, 0);
    if(bytesReceived < 0) {
        TransferException ex("Error receiving network packet: " + string(strerror(errno)));
        throw ex;
    } else if(bytesReceived < length) {
        throw TransferException("Received too short network packet!");
    }
}

void ParameterTransfer::checkProtocolVersion() {
    unsigned int version = 0;
    recvData(reinterpret_cast<unsigned char*>(&version), sizeof(version));

    if(ntohl(version) != static_cast<unsigned int>(InternalInformation::CURRENT_PROTOCOL_VERSION)) {
        throw ParameterException("Protocol version mismatch! Expected "
            + std::to_string(InternalInformation::CURRENT_PROTOCOL_VERSION)
            + " but received " + std::to_string(ntohl(version)));
    }
}

void ParameterTransfer::readParameter(unsigned char messageType, int32_t id, unsigned char* dest, int length) {
    if(length > 8) {
        throw ParameterException("Parameter type size mismatch!");
    }

    unsigned int networkId = htonl(id);
    unsigned char messageBuf[13];
    memset(messageBuf, 0, sizeof(messageBuf));

    messageBuf[0] = messageType;
    memcpy(&messageBuf[1], &networkId, 4);

    int written = send(socket, reinterpret_cast<char*>(messageBuf), sizeof(messageBuf), 0);
    if(written != sizeof(messageBuf)) {
        TransferException ex("Error sending parameter read request: " + string(strerror(errno)));
        throw ex;
    }

    unsigned char replyBuf[8];
    recvData(replyBuf, sizeof(replyBuf));
    memcpy(dest, replyBuf, length);
}

template<typename T>
void ParameterTransfer::writeParameter(unsigned char messageType, int32_t id, T value) {
    static_assert(sizeof(T) <= 8, "Parameter type musst be smaller or equal to 8 bytes");

    unsigned int networkId = htonl(id);
    unsigned char messageBuf[13];

    memset(messageBuf, 0, sizeof(messageBuf));
    messageBuf[0] = messageType;
    memcpy(&messageBuf[1], &networkId, 4);
    memcpy(&messageBuf[5], &value, sizeof(value));

    int written = send(socket, reinterpret_cast<char*>(messageBuf), sizeof(messageBuf), 0);
    if(written != sizeof(messageBuf)) {
        TransferException ex("Error sending parameter write request: " + string(strerror(errno)));
        throw ex;
    }

    unsigned char replyBuf[8];
    recvData(replyBuf, sizeof(replyBuf));

    if(replyBuf[0] == 0 && replyBuf[1] == 0 && replyBuf[2] == 0 && replyBuf[3] == 0) {
        throw ParameterException("Unable to write parameter");
    }
}

int ParameterTransfer::readIntParameter(int32_t id) {
    unsigned int data;
    readParameter(MESSAGE_READ_INT, id, reinterpret_cast<unsigned char*>(&data), sizeof(data));
    return static_cast<int>(ntohl(data));
}

double ParameterTransfer::readDoubleParameter(int32_t id) {
    double data;
    readParameter(MESSAGE_READ_DOUBLE, id, reinterpret_cast<unsigned char*>(&data), sizeof(data));
    return data;
}

bool ParameterTransfer::readBoolParameter(int32_t id) {
    unsigned int data;
    readParameter(MESSAGE_READ_BOOL, id, reinterpret_cast<unsigned char*>(&data), sizeof(data));
    return (data != 0);
}

void ParameterTransfer::writeIntParameter(int32_t id, int32_t value) {
    writeParameter(MESSAGE_WRITE_INT, id, htonl(static_cast<uint32_t>(value)));
}

void ParameterTransfer::writeDoubleParameter(int32_t id, double value) {
    writeParameter(MESSAGE_WRITE_DOUBLE, id, value);
}

void ParameterTransfer::writeBoolParameter(int32_t id, int32_t value) {
    writeParameter(MESSAGE_WRITE_BOOL, id, htonl(static_cast<uint32_t>(value)));
}

std::map<std::string, ParameterInfo> ParameterTransfer::getAllParameters() {
    unsigned char messageBuf[13]; // padded to common message size, payload ignored
    memset(messageBuf, 0, sizeof(messageBuf));
    messageBuf[0] = MESSAGE_ENUMERATE_PARAMS;

    int written = send(socket, reinterpret_cast<char*>(messageBuf), sizeof(messageBuf), 0);
    if(written != sizeof(messageBuf)) {
        TransferException ex("Error sending parameter enumeration request: " + string(strerror(errno)));
        throw ex;
    }
    auto enumeration = recvEnumeration();
    return enumeration;
}

}} // namespace

