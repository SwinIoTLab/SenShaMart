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

#include "visiontransfer/deviceparameters.h"
#include "visiontransfer/parametertransfer.h"
#include "visiontransfer/exceptions.h"
#include "visiontransfer/common.h"

using namespace visiontransfer;
using namespace visiontransfer::internal;

namespace visiontransfer {

/*************** Pimpl class containing all private members ***********/

class DeviceParameters::Pimpl {
public:
    Pimpl(const DeviceInfo& device);
    Pimpl(const char* address, const char* service);

    int readIntParameter(int id);
    double readDoubleParameter(int id);
    bool readBoolParameter(int id);

    void writeIntParameter(int id, int value);
    void writeDoubleParameter(int id, double value);
    void writeBoolParameter(int id, bool value);

    std::map<std::string, ParameterInfo> getAllParameters();
    
    // this template is selected for non-floating point arguments (i.e. int and bool).
    template<typename T>
    void setParameter_impl(StandardParameterIDs::ParameterID id, ParameterInfo::ParameterType type, T value, ...)
    {
        int cid = static_cast<int>(id);
        switch (type) {
            case ParameterInfo::TYPE_INT: {
                    writeIntParameter(cid, static_cast<int>(value));
                    break;
                }
            case ParameterInfo::TYPE_BOOL: {
                    writeBoolParameter(cid, value != 0);
                    break;
                }
            case ParameterInfo::TYPE_DOUBLE: {
                    writeDoubleParameter(cid, static_cast<double>(value));
                    break;
                }
        }
    }

    // this template is selected for floating point arguments
    template<typename T, typename std::enable_if<std::is_floating_point<T>::value>::type* = nullptr>
    void setParameter_impl(StandardParameterIDs::ParameterID id, ParameterInfo::ParameterType type, T value, double)
    {
        int cid = static_cast<int>(id);
        switch (type) {
            case ParameterInfo::TYPE_DOUBLE: {
                    writeDoubleParameter(cid, value);
                    break;
                }
            case ParameterInfo::TYPE_INT: {
                    writeIntParameter(cid, static_cast<int>(value));
                    break;
                }
            case ParameterInfo::TYPE_BOOL: {
                    writeBoolParameter(cid, value != 0);
                    break;
                }
        }
    }

    template <typename T>
    void setParameter(StandardParameterIDs::ParameterID id, ParameterInfo::ParameterType type, T t) {
        setParameter_impl<T>(id, type, t, double{});
    }

    ParameterInfo getParameter(const std::string& name);

    void lookupIDAndType(const std::string& name, internal::StandardParameterIDs::ParameterID& id, ParameterInfo::ParameterType& type);

private:
    std::map<std::string, ParameterInfo> serverSideEnumeration;

    std::map<std::string, ParameterInfo> getAllParametersInternal();

#ifndef DOXYGEN_SHOULD_SKIP_THIS
    template<typename T>
    void setNamedParameterInternal(const std::string& name, T value);
#endif

    ParameterTransfer paramTrans;
};

/******************** Stubs for all public members ********************/

DeviceParameters::DeviceParameters(const DeviceInfo& device):
    pimpl(new Pimpl(device)) {
    // All initialization in the pimpl class
}

DeviceParameters::DeviceParameters(const char* address, const char* service):
    pimpl(new Pimpl(address, service)) {
    // All initialization in the pimpl class
}

DeviceParameters::~DeviceParameters() {
    delete pimpl;
}

int DeviceParameters::readIntParameter(int id) {
    return pimpl->readIntParameter(id);
}

double DeviceParameters::readDoubleParameter(int id) {
    return pimpl->readDoubleParameter(id);
}

bool DeviceParameters::readBoolParameter(int id) {
    return pimpl->readBoolParameter(id);
}

void DeviceParameters::writeIntParameter(int id, int value) {
    pimpl->writeIntParameter(id, value);
}

void DeviceParameters::writeDoubleParameter(int id, double value) {
    pimpl->writeDoubleParameter(id, value);
}

void DeviceParameters::writeBoolParameter(int id, bool value) {
    pimpl->writeBoolParameter(id, value);
}

void DeviceParameters::Pimpl::lookupIDAndType(const std::string& name, StandardParameterIDs::ParameterID& id, ParameterInfo::ParameterType& type) {
    if (serverSideEnumeration.size() == 0) {
        // get the server-side parameter list first (which reports the types as well)
        (void) getAllParameters();
    }
    id = StandardParameterIDs::getParameterIDForName(name);
    if (id == StandardParameterIDs::ParameterID::UNDEFINED) {
        ParameterException ex("Cannot access parameter with unknown name: " + name);
        throw ex;
    }
    auto it = serverSideEnumeration.find(name);
    if (it == serverSideEnumeration.end()) {
        ParameterException ex("Server did not report the parameter in the supported list: " + name);
        throw ex;
    }
    type = it->second.getType();
}

std::map<std::string, ParameterInfo> DeviceParameters::getAllParameters()
{
    return pimpl->getAllParameters();
}

#ifndef DOXYGEN_SHOULD_SKIP_THIS
template<>
void VT_EXPORT DeviceParameters::setNamedParameter(const std::string& name, double value) {
    StandardParameterIDs::ParameterID id;
    ParameterInfo::ParameterType type;
    pimpl->lookupIDAndType(name, id, type);
    pimpl->setParameter<double>(id, type, value);
}
template<>
void VT_EXPORT DeviceParameters::setNamedParameter(const std::string& name, int value) {
    StandardParameterIDs::ParameterID id;
    ParameterInfo::ParameterType type;
    pimpl->lookupIDAndType(name, id, type);
    pimpl->setParameter<int>(id, type, value);
}
template<>
void VT_EXPORT DeviceParameters::setNamedParameter(const std::string& name, bool value) {
    StandardParameterIDs::ParameterID id;
    ParameterInfo::ParameterType type;
    pimpl->lookupIDAndType(name, id, type);
    pimpl->setParameter<bool>(id, type, value);
}

template<>
int VT_EXPORT DeviceParameters::getNamedParameter(const std::string& name) {
    StandardParameterIDs::ParameterID id;
    ParameterInfo::ParameterType type;
    pimpl->lookupIDAndType(name, id, type);
    return pimpl->getParameter(name).getValue<int>();
}
template<>
double VT_EXPORT DeviceParameters::getNamedParameter(const std::string& name) {
    StandardParameterIDs::ParameterID id;
    ParameterInfo::ParameterType type;
    pimpl->lookupIDAndType(name, id, type);
    return pimpl->getParameter(name).getValue<double>();
}
template<>
bool VT_EXPORT DeviceParameters::getNamedParameter(const std::string& name) {
    StandardParameterIDs::ParameterID id;
    ParameterInfo::ParameterType type;
    pimpl->lookupIDAndType(name, id, type);
    return pimpl->getParameter(name).getValue<bool>();
}
#endif

/******************** Implementation in pimpl class *******************/

DeviceParameters::Pimpl::Pimpl(const char* address, const char* service)
    : paramTrans(address, service) {
}

DeviceParameters::Pimpl::Pimpl(const DeviceInfo& device)
    : paramTrans(device.getIpAddress().c_str(), "7683") {
}

int DeviceParameters::Pimpl::readIntParameter(int id) {
    return paramTrans.readIntParameter(id);
}

double DeviceParameters::Pimpl::readDoubleParameter(int id) {
    return paramTrans.readDoubleParameter(id);
}

bool DeviceParameters::Pimpl::readBoolParameter(int id) {
    return paramTrans.readBoolParameter(id);
}

void DeviceParameters::Pimpl::writeIntParameter(int id, int value) {
    paramTrans.writeIntParameter(id, value);
}

void DeviceParameters::Pimpl::writeDoubleParameter(int id, double value) {
    paramTrans.writeDoubleParameter(id, value);
}

void DeviceParameters::Pimpl::writeBoolParameter(int id, bool value) {
    paramTrans.writeBoolParameter(id, value);
}

std::map<std::string, ParameterInfo> DeviceParameters::Pimpl::getAllParameters() {
    serverSideEnumeration = paramTrans.getAllParameters();
    return serverSideEnumeration;
}


ParameterInfo DeviceParameters::Pimpl::getParameter(const std::string& name)
{
    return serverSideEnumeration[name];
}

} // namespace

