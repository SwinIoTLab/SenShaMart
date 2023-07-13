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

#ifndef VISIONTRANSFER_DEVICEPARAMETERS_H
#define VISIONTRANSFER_DEVICEPARAMETERS_H

#include "visiontransfer/common.h"
#include "visiontransfer/deviceinfo.h"
#include "visiontransfer/standardparameterids.h"
#include "visiontransfer/parameterinfo.h"

#include <map>

namespace visiontransfer {

/**
 * \brief Allows for configuration of the parameters of a Nerian stereo device
 * through a network connection.
 *
 * Parameters are read and written through a TCP connection. Not all
 * parameters that are available in the web interface can be configured
 * through this class.
 *
 * If parameters are changed, they are only valid until the device is
 * rebooted or until a parameter change is performed through the web
 * interface.
 *
 * Since device parameters should be predictable at all times,
 * the functions from this class will internally throw a
 * visiontransfer::TransferException in case of network failure
 * or device reinitialization during parameter access. Please catch
 * this exception if you wish to handle such cases.
 */

class VT_EXPORT DeviceParameters {
public:
    /**
     * \brief Connects to parameter server of a Nerian stereo device by using the
     * device information from device enumeration.
     *
     * \param device Information on the device to which a connection should
     *               be established.
     */
    DeviceParameters(const DeviceInfo& device);

    /**
     * \brief Connects to parameter server of a Nerian stereo device by using a network
     * address.
     *
     * \param address   IP address or host name of the device to which a connection should
     *                  be established.
     * \param service   The port number that should be used as string or
     *                  as textual service name.
     */
    DeviceParameters(const char* address, const char* service = "7683");

    ~DeviceParameters();

    // Processing settings

    /**
     * \brief Operation modes supported by Nerian stereo devices.
     */
    enum OperationMode {
        /// The device passes through the input images without modification.
        PASS_THROUGH = 0,

        /// The devices outputs the rectified input images.
        RECTIFY = 1,

        /// The devices performs stereo matching.
        STEREO_MATCHING = 2
    };

    /**
     * \brief Gets the current operation mode.
     * \return  The current operation mode, which can be PASS_THROUGH,
     *          RECTIFY or STEREO_MATCHING.
     * \see     OperationMode
     */
    OperationMode getOperationMode() {
        return static_cast<OperationMode>(readIntParameter(internal::StandardParameterIDs::OPERATION_MODE));
    }

    /**
     * \brief Configures the device to a new operation mode.
     * \param mode  The new operation mode, which can be PASS_THROUGH,
     *              RECTIFY or STEREO_MATCHING.
     * \see         OperationMode
     */
    void setOperationMode(OperationMode mode) {
        writeIntParameter(internal::StandardParameterIDs::OPERATION_MODE, static_cast<int>(mode));
    }

    /**
     * \brief Gets the current offset of the evaluated disparity range.
     */
    int getDisparityOffset() {
        return readIntParameter(internal::StandardParameterIDs::DISPARITY_OFFSET);
    }

    /**
     * \brief Sets the offset of the evaluated disparity range.
     *
     * The offset plus the number of disparities must be smaller or equal to 256.
     */
    void setDisparityOffset(int offset) {
        writeIntParameter(internal::StandardParameterIDs::DISPARITY_OFFSET, offset);
    }

    // Algorithmic settings

    /**
     * \brief Gets the SGM penalty P1 for small disparity changes at image edges.
     */
    int getStereoMatchingP1Edge() {
        return readIntParameter(internal::StandardParameterIDs::SGM_P1_EDGE);
    }

    /**
     * \brief Sets the SGM penalty P1 for small disparity changes at image edges.
     *
     * This parameter must be in the range of 0 to 255.
     */
    void setStereoMatchingP1Edge(int p1) {
        writeIntParameter(internal::StandardParameterIDs::SGM_P1_EDGE, p1);
    }

    /**
     * \brief Gets the SGM penalty P1 for small disparity changes outside image edges.
     */
    int getStereoMatchingP1NoEdge() {
        return readIntParameter(internal::StandardParameterIDs::SGM_P1_NO_EDGE);
    }

    /**
     * \brief Sets the SGM penalty P1 for small disparity changes outside image edges.
     *
     * This parameter must be in the range of 0 to 255.
     */
    void setStereoMatchingP1NoEdge(int p1) {
        writeIntParameter(internal::StandardParameterIDs::SGM_P1_NO_EDGE, p1);
    }

    /**
     * \brief Gets the SGM penalty P2 for large disparity changes at image edges.
     */
    int getStereoMatchingP2Edge() {
        return readIntParameter(internal::StandardParameterIDs::SGM_P2_EDGE);
    }

    /**
     * \brief Sets the SGM penalty P2 for large disparity changes at image edges.
     *
     * This parameter must be in the range of 0 to 255.
     */
    void setStereoMatchingP2Edge(int p2) {
        writeIntParameter(internal::StandardParameterIDs::SGM_P2_EDGE, p2);
    }

    /**
     * \brief Gets the SGM penalty P2 for large disparity changes at image edges.
     */
    int getStereoMatchingP2NoEdge() {
        return readIntParameter(internal::StandardParameterIDs::SGM_P2_NO_EDGE);
    }

    /**
     * \brief Sets the SGM penalty P2 for large disparity changes at image edges.
     *
     * This parameter must be in the range of 0 to 255.
     */
    void setStereoMatchingP2NoEdge(int p2) {
        writeIntParameter(internal::StandardParameterIDs::SGM_P2_NO_EDGE, p2);
    }

    /**
     * \brief Gets the edge sensitivity of the SGM algorithm
     */
    int getStereoMatchingEdgeSensitivity() {
        return readIntParameter(internal::StandardParameterIDs::SGM_EDGE_SENSITIVITY);
    }

    /**
     * \brief Sets the edge sensitivity of the SGM algorithm
     *
     * This parameter must be in the range of 0 to 255.
     */
    void setStereoMatchingEdgeSensitivity(int sensitivity) {
        writeIntParameter(internal::StandardParameterIDs::SGM_EDGE_SENSITIVITY, sensitivity);
    }

    /**
     * \brief Returns true if border pixels are removed from the computed
     * disparity map.
     */
    bool getMaskBorderPixelsEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::MASK_BORDER_PIXELS_ENABLED);
    }

    /**
     * \brief Enables or disables the removal of border pixels from the computed
     * disparity map.
     */
    void setMaskBorderPixelsEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::MASK_BORDER_PIXELS_ENABLED, enabled);
    }

    /**
     * \brief Returns true if the consistency check is enabled.
     */
    bool getConsistencyCheckEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::CONSISTENCY_CHECK_ENABLED);
    }

    /**
     * \brief Enables or disables the consistency check.
     */
    void setConsistencyCheckEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::CONSISTENCY_CHECK_ENABLED, enabled);
    }

    /**
     * \brief Gets the current sensitivity value for the consistency check.
     */
    int getConsistencyCheckSensitivity() {
        return readIntParameter(internal::StandardParameterIDs::CONSISTENCY_CHECK_SENSITIVITY);
    }

    /**
     * \brief Sets a new sensitivity value for the consistency check.
     *
     * This parameter must be in the range of 0 to 15.
     */
    void setConsistencyCheckSensitivity(int sensitivity) {
        writeIntParameter(internal::StandardParameterIDs::CONSISTENCY_CHECK_SENSITIVITY, sensitivity);
    }

    /**
     * \brief Returns true if the consistency check is enabled.
     */
    bool getUniquenessCheckEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::UNIQUENESS_CHECK_ENABLED);
    }

    /**
     * \brief Enables or disables the uniqueness check.
     */
    void setUniquenessCheckEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::UNIQUENESS_CHECK_ENABLED, enabled);
    }

    /**
     * \brief Gets the current sensitivity value for the uniqueness check.
     */
    int getUniquenessCheckSensitivity() {
        return readIntParameter(internal::StandardParameterIDs::UNIQUENESS_CHECK_SENSITIVITY);
    }

    /**
     * \brief Sets a new sensitivity value for the uniqueness check.
     *
     * This parameter must be in the range of 0 to 256.
     */
    void setUniquenessCheckSensitivity(int sensitivity) {
        writeIntParameter(internal::StandardParameterIDs::UNIQUENESS_CHECK_SENSITIVITY, sensitivity);
    }

    /**
     * \brief Returns true if the texture filter is enabled.
     */
    bool getTextureFilterEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::TEXTURE_FILTER_ENABLED);
    }

    /**
     * \brief Enables or disables the texture filter.
     */
    void setTextureFilterEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::TEXTURE_FILTER_ENABLED, enabled);
    }

    /**
     * \brief Gets the current sensitivity value for the texture filter.
     */
    int getTextureFilterSensitivity() {
        return readIntParameter(internal::StandardParameterIDs::TEXTURE_FILTER_SENSITIVITY);
    }

    /**
     * \brief Sets a new sensitivity value for the texture filter.
     *
     * This parameter must be in the range of 0 to 63.
     */
    void setTextureFilterSensitivity(int sensitivity) {
        writeIntParameter(internal::StandardParameterIDs::TEXTURE_FILTER_SENSITIVITY, sensitivity);
    }

    /**
     * \brief Returns true if the texture gap interpolation is enabled.
     */
    bool getGapInterpolationEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::GAP_INTERPOLATION_ENABLED);
    }

    /**
     * \brief Enables or disables the gap interpolation.
     */
    void setGapInterpolationEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::GAP_INTERPOLATION_ENABLED, enabled);
    }

    /**
     * \brief Returns true if the noise reduction filter is enabled.
     */
    bool getNoiseReductionEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::NOISE_REDUCTION_ENABLED);
    }

    /**
     * \brief Enables or disables the noise reduction filter.
     */
    void setNoiseReductionEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::NOISE_REDUCTION_ENABLED, enabled);
    }

    /**
     * \brief Returns true if the speckle filter is enabled.
     */
    int getSpeckleFilterIterations() {
        return readIntParameter(internal::StandardParameterIDs::SPECKLE_FILTER_ITERATIONS);
    }

    /**
     * \brief Enables or disables the speckle filter.
     */
    void setSpeckleFilterIterations(int iter) {
        writeIntParameter(internal::StandardParameterIDs::SPECKLE_FILTER_ITERATIONS, iter);
    }

    // Exposure and gain settings

    /**
     * \brief Possible modes of the automatic exposure and gain control.
     */
    enum AutoMode {
        /// Both, exposure and gain are automatically adjusted
        AUTO_EXPOSURE_AND_GAIN = 0,

        /// Only exposure is automatically adjusted, gain is set manually
        AUTO_EXPOSURE_MANUAL_GAIN = 1,

        /// Only gain is automatically adjusted, exposure is set manually
        MANUAL_EXPOSORE_AUTO_GAIN = 2,

        /// Both, exposure and gain are set manually
        MANUAL_EXPOSURE_MANUAL_GAIN = 3
    };

    /**
     * \brief Gets the current mode of the automatic exposure and gain control.
     * \see AutoMode
     */
    AutoMode getAutoMode() {
        return static_cast<AutoMode>(readIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_MODE));
    }

    /**
     * \brief Sets the current mode of the automatic exposure and gain control.
     * \see AutoMode
     */
    void setAutoMode(AutoMode mode) {
        writeIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_MODE, static_cast<int>(mode));
    }

    /**
     * \brief Gets the target image intensity of the automatic exposure and gain control
     * \return The target intensity.
     *
     * Intensities are measured from 0.0 to 1.0, with 0.0 being the darkest,
     * and 1.0 the brightest possible pixel intensity.
     */
    double getAutoTargetIntensity() {
        return readDoubleParameter(internal::StandardParameterIDs::AUTO_TARGET_INTENSITY);
    }

    /**
     * \brief Sets the target image intensity of the automatic exposure and gain control
     * \param intensity The new target intensity.
     *
     * Intensities are measured from 0.0 to 1.0, with 0.0 being the darkest,
     * and 1.0 the brightest possible pixel intensity.
     */
    void setAutoTargetIntensity(double intensity) {
        writeDoubleParameter(internal::StandardParameterIDs::AUTO_TARGET_INTENSITY, intensity);
    }

    /**
     * \brief Gets the minimum intensity change that is required for adjusting
     * the camera settings.
     *
     * Intensity values are relatively to the target intensity. A value of
     * 0.01 represents a change of 1%.
     */
    double getAutoIntensityDelta() {
        return readDoubleParameter(internal::StandardParameterIDs::AUTO_INTENSITY_DELTA);
    }

    /**
     * \brief Sets the minimum intensity change that is required for adjusting
     * the camera settings.
     *
     * Intensity values are relatively to the target intensity. A value of
     * 0.01 represents a change of 1%.
     */
    void setAutoIntensityDelta(double delta) {
        writeDoubleParameter(internal::StandardParameterIDs::AUTO_INTENSITY_DELTA, delta);
    }

    /**
     * \brief Possible options for the target frame selection of the
     * automatic exposure and gain control.
     */
    enum TargetFrame {
        /// Control using only the left frame
        LEFT_FRAME = 0,

        /// Control using only the right frame
        RIGHT_FRAME = 1,

        /// Control using both frames
        BOTH_FRAMES = 2,
    };

    /**
     * \brief Gets the selected target frame for automatic exposure and gain control.
     * \see TargetFrame
     */
    TargetFrame getAutoTargetFrame() {
        return static_cast<TargetFrame>(readIntParameter(internal::StandardParameterIDs::AUTO_TARGET_FRAME));
    }

    /**
     * \brief Selects the target frame for automatic exposure and gain control.
     * \see TargetFrame
     */
    void setAutoTargetFrame(TargetFrame target) {
        writeIntParameter(internal::StandardParameterIDs::AUTO_TARGET_FRAME, static_cast<int>(target));
    }

    /**
     * \brief Gets the current interval at which the automatic exposure and gain control is run.
     *
     * The return value indicates the number of skipped frames between each
     * adjustment. Typically a value > 0 is desired to give the cameras enough
     * time to react to the new setting.
     */
    int getAutoSkippedFrames() {
        return readIntParameter(internal::StandardParameterIDs::AUTO_SKIPPED_FRAMES);
    }

    /**
     * \brief Sets the current interval at which the automatic exposure and gain control is run.
     *
     * The return value indicates the number of skipped frames between each
     * adjustment. Typically a value > 0 is desired to give the cameras enough
     * time to react to the new setting.
     */
    void setAutoSkippedFrames(int skipped) {
        writeIntParameter(internal::StandardParameterIDs::AUTO_SKIPPED_FRAMES, skipped);
    }

    /**
     * \brief Gets the maximum exposure time that can be selected automatically.
     * \return Maximum exposure time in microseconds.
     */
    double getAutoMaxExposureTime() {
        return readDoubleParameter(internal::StandardParameterIDs::AUTO_MAXIMUM_EXPOSURE_TIME);
    }

    /**
     * \brief Sets the maximum exposure time that can be selected automatically.
     * \param time  Maximum exposure time in microseconds.
     */
    void setAutoMaxExposureTime(double time) {
        writeDoubleParameter(internal::StandardParameterIDs::AUTO_MAXIMUM_EXPOSURE_TIME, time);
    }

    /**
     * \brief Gets the maximum gain that can be selected automatically.
     * \return Maximum gain in dB.
     */
    double getAutoMaxGain() {
        return readDoubleParameter(internal::StandardParameterIDs::AUTO_MAXIMUM_GAIN);
    }

    /**
     * \brief Gets the maximum gain that can be selected automatically.
     * \param gain  Maximum gain in dB.
     */
    void setAutoMaxGain(double gain) {
        writeDoubleParameter(internal::StandardParameterIDs::AUTO_MAXIMUM_GAIN, gain);
    }

    /**
     * \brief Gets the manually selected exposure time.
     * \return Exposure time in microseconds.
     *
     * This parameter is only relevant if the auto mode is set to
     * MANUAL_EXPOSORE_AUTO_GAIN or MANUAL_EXPOSURE_MANUAL_GAIN.
     *
     * \see setAutoMode
     */
    double getManualExposureTime() {
        return readDoubleParameter(internal::StandardParameterIDs::MANUAL_EXPOSURE_TIME);
    }

    /**
     * \brief Sets the manually selected exposure time.
     * \param time  Exposure time in microseconds.
     *
     * This parameter is only relevant if the auto mode is set to
     * MANUAL_EXPOSORE_AUTO_GAIN or MANUAL_EXPOSURE_MANUAL_GAIN.
     *
     * \see setAutoMode
     */
    void setManualExposureTime(double time) {
        writeDoubleParameter(internal::StandardParameterIDs::MANUAL_EXPOSURE_TIME, time);
    }

    /**
     * \brief Gets the manually selected gain.
     * \return Gain in dB.
     *
     * This parameter is only relevant if the auto mode is set to
     * AUTO_EXPOSORE_MANUAL_GAIN or MANUAL_EXPOSURE_MANUAL_GAIN.
     *
     * \see setAutoMode
     */
    double getManualGain() {
        return readDoubleParameter(internal::StandardParameterIDs::MANUAL_GAIN);
    }

    /**
     * \brief Sets the manually selected gain.
     * \param gain Gain in dB.
     *
     * This parameter is only relevant if the auto mode is set to
     * AUTO_EXPOSORE_MANUAL_GAIN or MANUAL_EXPOSURE_MANUAL_GAIN.
     *
     * \see setAutoMode
     */
    void setManualGain(double gain) {
        writeDoubleParameter(internal::StandardParameterIDs::MANUAL_GAIN, gain);
    }

    /**
     * \brief Returns true if an ROI for automatic exposure and gain control is enabled.
     */
    bool getAutoROIEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_ENABLED);
    }

    /**
     * \brief Enables or disables an ROI for automatic exposure and gain control.
     */
    void setAutoROIEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_ENABLED, enabled);
    }

    /**
     * \brief Gets the configured ROI for automatic exposure and gain control.
     *
     * \param x         Horizontal offset of the ROI from the image center. A value
     *                  of 0 means the ROI is horizontally centered.
     * \param y         Vertical offset of the ROI from the image center. A value
     *                  of 0 means the ROI is vertically centered.
     * \param width     Width of the ROI.
     * \param height    Height of the ROI.
     *
     * The ROI must be enabled with setAutoROIEnabled() before it is considered
     * for exposure or gain control.
     */
    void getAutoROI(int& x, int& y, int& width, int& height) {
        x = readIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_X);
        y = readIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_Y);
        width = readIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_WIDTH);
        height = readIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_HEIGHT);
    }

    /**
     * \brief Sets the configured ROI for automatic exposure and gain control.
     *
     * \param x         Horizontal offset of the ROI from the image center. A value
     *                  of 0 means the ROI is horizontally centered.
     * \param y         Vertical offset of the ROI from the image center. A value
     *                  of 0 means the ROI is vertically centered.
     * \param width     Width of the ROI.
     * \param height    Height of the ROI.
     *
     * The ROI must be enabled with setAutoROIEnabled() before it is considered
     * for exposure or gain control.
     */
    void setAutoROI(int x, int y, int width, int height) {
        writeIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_X, x);
        writeIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_Y, y);
        writeIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_WIDTH, width);
        writeIntParameter(internal::StandardParameterIDs::AUTO_EXPOSURE_ROI_HEIGHT, height);
    }

    // Trigger and pairing settings

    /**
     * \brief Gets the maximum allowed time difference between two corresponding
     * frames.
     * \return Time difference in milliseconds. A value of -1 corresponds to automatic
     * pairing.
     */
    int getMaxFrameTimeDifference() {
        return readIntParameter(internal::StandardParameterIDs::MAX_FRAME_TIME_DIFFERENCE_MS);
    }

    /**
     * \brief Sets the maximum allowed time difference between two corresponding
     * frames.
     * \param diffMs    Time difference in milliseconds. If automatic pairing is desired,
     *      a value of -1 should be set.
     */
    void setMaxFrameTimeDifference(int diffMs) {
        writeIntParameter(internal::StandardParameterIDs::MAX_FRAME_TIME_DIFFERENCE_MS, diffMs);
    }

    /**
     * \brief Gets the frequency of the trigger signal.
     * \return Frequency in Hz.
     */
    double getTriggerFrequency() {
        return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_FREQUENCY);
    }

    /**
     * \brief Sets the frequency of the trigger signal.
     * \param freq Frequency in Hz.
     */
    void setTriggerFrequency(double freq) {
        writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_FREQUENCY, freq);
    }

    /**
     * \brief Returns true if trigger signal 0 is enabled.
     */
    bool getTrigger0Enabled() {
        return readBoolParameter(internal::StandardParameterIDs::TRIGGER_0_ENABLED);
    }

    /**
     * \brief Enables or disables trigger signal 0.
     */
    void setTrigger0Enabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::TRIGGER_0_ENABLED, enabled);
    }

    /**
     * \brief Returns the constant value that is output when trigger 0 is disabled
     */
    bool getTrigger0Constant() {
        return readBoolParameter(internal::StandardParameterIDs::TRIGGER_0_CONSTANT);
    }

    /**
     * \brief Sets the constant value that is output when trigger 0 is disabled
     */
    void setTrigger0Constant(bool on) {
        writeBoolParameter(internal::StandardParameterIDs::TRIGGER_0_CONSTANT, on);
    }

    /**
     * \brief Returns false if trigger0 polarity is active-high (non-inverted) and
     * false if polarity is active-low (inverted)
     */
    bool getTrigger0Polarity() {
        return readBoolParameter(internal::StandardParameterIDs::TRIGGER_0_POLARITY);
    }

    /**
     * \brief Sets the polarity for trigger0. If invert is false, the polarity
     * is active-high (non-inverted). Otherwise the polarity is active-low (inverted).
     */
    void setTrigger0Polarity(bool invert) {
        writeBoolParameter(internal::StandardParameterIDs::TRIGGER_0_POLARITY, invert);
    }

    /**
     * \brief Returns true if trigger signal 1 is enabled.
     */
    bool getTrigger1Enabled() {
        return readBoolParameter(internal::StandardParameterIDs::TRIGGER_1_ENABLED);
    }

    /**
     * \brief Enables or disables trigger signal 1.
     */
    void setTrigger1Enabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::TRIGGER_1_ENABLED, enabled);
    }

    /**
     * \brief Returns the constant value that is output when trigger 1 is disabled
     */
    bool getTrigger1Constant() {
        return readBoolParameter(internal::StandardParameterIDs::TRIGGER_1_CONSTANT);
    }

    /**
     * \brief Sets the constant value that is output when trigger 1 is disabled
     */
    void setTrigger1Constant(bool on) {
        writeBoolParameter(internal::StandardParameterIDs::TRIGGER_1_CONSTANT, on);
    }

    /**
     * \brief Returns false if trigger1 polarity is active-high (non-inverted) and
     * false if polarity is active-low (inverted)
     */
    bool getTrigger1Polarity() {
        return readBoolParameter(internal::StandardParameterIDs::TRIGGER_1_POLARITY);
    }

    /**
     * \brief Sets the polarity for trigger1. If invert is false, the polarity
     * is active-high (non-inverted). Otherwise the polarity is active-low (inverted).
     */
    void setTrigger1Polarity(bool invert) {
        writeBoolParameter(internal::StandardParameterIDs::TRIGGER_1_POLARITY, invert);
    }

    /**
     * \brief Gets the pulse width of trigger signal 0.
     * \param pulse     For a cyclic pulse width configuration, this is the index
     *                  of the pulse for which to return the width. Valid values
     *                  are 0 to 7.
     * \return Pulse width in milliseconds.
     */
    double getTrigger0PulseWidth(int pulse=0) {
        switch(pulse) {
            case 0: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_0_PULSE_WIDTH);
            case 1: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_0B_PULSE_WIDTH);
            case 2: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_0C_PULSE_WIDTH);
            case 3: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_0D_PULSE_WIDTH);
            case 4: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_0E_PULSE_WIDTH);
            case 5: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_0F_PULSE_WIDTH);
            case 6: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_0G_PULSE_WIDTH);
            case 7: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_0H_PULSE_WIDTH);
            default: return -1;
        }
    }

    /**
     * \brief Sets the pulse width of trigger signal 0.
     * \param width     Pulse width in milliseconds.
     * \param pulse     For a cyclic pulse width configuration, this is the index
     *                  of the pulse for which to set the width. Valid values
     *                  are 0 to 7.
     */
    void setTrigger0PulseWidth(double width, int pulse=0) {
        switch(pulse) {
            case 0: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_0_PULSE_WIDTH, width);break;
            case 1: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_0B_PULSE_WIDTH, width);break;
            case 2: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_0C_PULSE_WIDTH, width);break;
            case 3: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_0D_PULSE_WIDTH, width);break;
            case 4: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_0E_PULSE_WIDTH, width);break;
            case 5: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_0F_PULSE_WIDTH, width);break;
            case 6: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_0G_PULSE_WIDTH, width);break;
            case 7: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_0H_PULSE_WIDTH, width);break;
            default: return;
        }
    }

    /**
     * \brief Gets the pulse width of trigger signal 1.
     * \param pulse     For a cyclic pulse width configuration, this is the index
     *                  of the pulse for which to return the width. Valid values
     *                  are 0 to 7.
     * \return Pulse width in milliseconds.
     */
    double getTrigger1PulseWidth(int pulse=0) {
        switch(pulse) {
            case 0: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1_PULSE_WIDTH);
            case 1: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1B_PULSE_WIDTH);
            case 2: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1C_PULSE_WIDTH);
            case 3: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1D_PULSE_WIDTH);
            case 4: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1E_PULSE_WIDTH);
            case 5: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1F_PULSE_WIDTH);
            case 6: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1G_PULSE_WIDTH);
            case 7: return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1H_PULSE_WIDTH);
            default: return -1;
        }
    }

    /**
     * \brief Sets the pulse width of trigger signal 1.
     * \param width     Pulse width in milliseconds.
     * \param pulse     For a cyclic pulse width configuration, this is the index
     *                  of the pulse for which to set the width. Valid values
     *                  are 0 to 7.
     */
    void setTrigger1PulseWidth(double width, int pulse=0) {
        switch(pulse) {
            case 0: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1_PULSE_WIDTH, width);break;
            case 1: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1B_PULSE_WIDTH, width);break;
            case 2: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1C_PULSE_WIDTH, width);break;
            case 3: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1D_PULSE_WIDTH, width);break;
            case 4: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1E_PULSE_WIDTH, width);break;
            case 5: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1F_PULSE_WIDTH, width);break;
            case 6: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1G_PULSE_WIDTH, width);break;
            case 7: writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1H_PULSE_WIDTH, width);break;
            default: return;
        }
    }

    /**
     * \brief Gets the time offset between trigger signal 1 and signal 0.
     * \return Offset in milliseconds.
     */
    double getTrigger1Offset() {
        return readDoubleParameter(internal::StandardParameterIDs::TRIGGER_1_OFFSET);
    }

    /**
     * \brief Sets the time offset between trigger signal 1 and signal 0.
     * \param offset    Offset in milliseconds.
     */
    void setTrigger1Offset(double offset) {
        writeDoubleParameter(internal::StandardParameterIDs::TRIGGER_1_OFFSET, offset);
    }

    /**
     * \brief Returns true if the extgernal trigger input is enabled.
     */
    bool getInput() {
        return readBoolParameter(internal::StandardParameterIDs::TRIGGER_INPUT);
    }

    /**
     * \brief Enables or disables the external trigger input
     */
    void setTrigger1Offset(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::TRIGGER_INPUT, enabled);
    }


    // Auto calibration parameters

    /**
     * \brief Returns true if auto re-calibration is enabled.
     */
    bool getAutoRecalibrationEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::AUTO_RECALIBRATION_ENABLED);
    }

    /**
     * \brief Enables or disables auto-recalibration.
     */
    void setAutoRecalibrationEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::AUTO_RECALIBRATION_ENABLED, enabled);
    }

    /**
     * \brief Returns true if persistent storage of auto re-calibration results is enabled.
     */
    bool getSaveAutoRecalibration() {
        return readBoolParameter(internal::StandardParameterIDs::AUTO_RECALIBRATION_PERMANENT);
    }

    /**
     * \brief Enables or disables persistent storage of auto re-calibration results.
     */
    void setSaveAutoRecalibration(bool save) {
        writeBoolParameter(internal::StandardParameterIDs::AUTO_RECALIBRATION_PERMANENT, save);
    }

    /**
     * \brief Returns true if an ROI for the subpixel optimization algorithm is enabled
     * (otherwise complete frames are used for optimization).
     */
    bool getSubpixelOptimizationROIEnabled() {
        return readBoolParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_ENABLED);
    }

    /**
     * \brief Enables or disables an ROI for the subpixel optimization algorithm.
     * (if disabled, complete frames are used for optimization).
     */
    void setSubpixelOptimizationROIEnabled(bool enabled) {
        writeBoolParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_ENABLED, enabled);
    }

    /**
     * \brief Gets the configured ROI for the subpixel optimization algorithm.
     *
     * \param x         Horizontal offset of the ROI from the image center. A value
     *                  of 0 means the ROI is horizontally centered.
     * \param y         Vertical offset of the ROI from the image center. A value
     *                  of 0 means the ROI is vertically centered.
     * \param width     Width of the ROI.
     * \param height    Height of the ROI.
     *
     * The ROI must be enabled with setSubpixelOptimizationROIEnabled(), otherwise the
     * optimization algorithm will consider the full images.
     */
    void getSubpixelOptimizationROI(int& x, int& y, int& width, int& height) {
        x = readIntParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_X);
        y = readIntParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_Y);
        width = readIntParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_WIDTH);
        height = readIntParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_HEIGHT);
    }

    /**
     * \brief Sets the configured ROI for the subpixel optimization algorithm.
     *
     * \param x         Horizontal offset of the ROI from the image center. A value
     *                  of 0 means the ROI is horizontally centered.
     * \param y         Vertical offset of the ROI from the image center. A value
     *                  of 0 means the ROI is vertically centered.
     * \param width     Width of the ROI.
     * \param height    Height of the ROI.
     *
     * The ROI must be enabled with setSubpixelOptimizationROIEnabled(), otherwise the
     * optimization algorithm will consider the full images.
     */
    void setSubpixelOptimizationROI(int x, int y, int width, int height) {
        writeIntParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_X, x);
        writeIntParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_Y, y);
        writeIntParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_WIDTH, width);
        writeIntParameter(internal::StandardParameterIDs::SUBPIXEL_OPTIMIZATION_ROI_HEIGHT, height);
    }

    /**
     * \brief Remotely triggers a reboot of the device
     */
    void reboot() {
        writeBoolParameter(internal::StandardParameterIDs::REBOOT, true);
    }

    /**
     * \brief Enumerates all parameters as reported by the device
     * \return A map associating available parameter names with visiontransfer::ParameterInfo entries
     */
    std::map<std::string, ParameterInfo> getAllParameters();

    /**
     * \brief Set a parameter by name. ParameterException for invalid names.
     */
    template<typename T>
    void setNamedParameter(const std::string& name, T value);

    /**
     * \brief Get a parameter by name, specifying the return type (int, double or bool). ParameterException for invalid names.
     */
    template<typename T>
    T getNamedParameter(const std::string& name);

private:
    // We (mostly) follow the pimpl idiom here
    class Pimpl;
    Pimpl* pimpl;

    // This class cannot be copied
    DeviceParameters(const DeviceParameters& other);
    DeviceParameters& operator=(const DeviceParameters& other);

    // Generic functions for reading parameters
    int readIntParameter(int id);
    double readDoubleParameter(int id);
    bool readBoolParameter(int id);

    // Generic functions for writing parameters
    void writeIntParameter(int id, int value);
    void writeDoubleParameter(int id, double value);
    void writeBoolParameter(int id, bool value);

};

#ifndef DOXYGEN_SHOULD_SKIP_THIS
// For source compatibility
DEPRECATED("Use DeviceParameters instead.")
typedef DeviceParameters SceneScanParameters;
#endif

} // namespace

#endif
