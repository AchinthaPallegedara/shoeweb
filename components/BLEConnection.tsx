"use client";
import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

interface SensorData {
  accel: { x: number; y: number; z: number };
  gyro: { x: number; y: number; z: number };
  temp: number;
}

interface RecordedMotion {
  motionName: string;
  timestamp: string;
  data: SensorData[];
}

const MotionDataCollector = () => {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [characteristic, setCharacteristic] =
    useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [error, setError] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);

  const [motionName, setMotionName] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordedMotions, setRecordedMotions] = useState<RecordedMotion[]>([]);
  const [sampleCount, setSampleCount] = useState(0);

  const recordingDataRef = useRef<SensorData[]>([]);
  const recordingTimeRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false); // Added ref for reliable state tracking

  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
  const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
  const RECORDING_DURATION = 60;

  const parseSensorData = (data: string) => {
    data = data.trim();
    if (!data) return null;

    try {
      const numbers = data.split(",").map(Number);
      if (numbers.length >= 7 && numbers.every((n) => !isNaN(n))) {
        return {
          accel: { x: numbers[0], y: numbers[1], z: numbers[2] },
          gyro: { x: numbers[3], y: numbers[4], z: numbers[5] },
          temp: numbers[6],
        };
      }
    } catch (e) {
      console.error("Error parsing sensor data:", e, "Raw data:", data);
    }
    return null;
  };

  const connectToBLE = async () => {
    try {
      const selectedDevice = await navigator.bluetooth.requestDevice({
        filters: [{ name: "ESP32-MPU6050" }],
        optionalServices: [SERVICE_UUID],
      });

      setDevice(selectedDevice);

      selectedDevice.addEventListener("gattserverdisconnected", () => {
        setIsConnected(false);
        setError("Device disconnected");
      });

      const server = await selectedDevice.gatt?.connect();
      const service = await server?.getPrimaryService(SERVICE_UUID);
      const characteristic = await service?.getCharacteristic(
        CHARACTERISTIC_UUID
      );

      if (characteristic) {
        setCharacteristic(characteristic);
        setIsConnected(true);
        setError("");

        characteristic.addEventListener(
          "characteristicvaluechanged",
          (event: Event) => {
            const value = new TextDecoder().decode(
              (event.target as BluetoothRemoteGATTCharacteristic).value
            );
            const parsed = parseSensorData(value);
            if (parsed) {
              setSensorData(parsed);
              if (isRecordingRef.current) {
                // Use ref instead of state
                recordingDataRef.current.push(parsed);
                setSampleCount((prev) => prev + 1);
              }
            }
          }
        );
        await characteristic.startNotifications();
      }
    } catch (error) {
      setError((error as Error).message);
      setIsConnected(false);
    }
  };

  const calibrateSensor = async () => {
    if (characteristic) {
      try {
        const encoder = new TextEncoder();
        await characteristic.writeValue(encoder.encode("0"));
        setIsCalibrated(true);
      } catch (error) {
        setError((error as Error).message);
      }
    }
  };

  const startRecording = () => {
    if (!motionName) {
      setError("Please enter a motion name");
      return;
    }

    recordingDataRef.current = [];
    setSampleCount(0);
    isRecordingRef.current = true; // Update ref first
    setIsRecording(true);
    setRecordingProgress(0);

    let secondsElapsed = 0;
    recordingTimeRef.current = setInterval(() => {
      secondsElapsed++;
      setRecordingProgress((secondsElapsed / RECORDING_DURATION) * 100);

      if (secondsElapsed >= RECORDING_DURATION) {
        stopRecording();
      }
    }, 1000);
  };

  const stopRecording = () => {
    if (recordingTimeRef.current) {
      clearInterval(recordingTimeRef.current);
    }

    isRecordingRef.current = false; // Update ref first
    setIsRecording(false);
    setRecordingProgress(0);

    // Add slight delay to capture final data
    setTimeout(() => {
      console.log("Final sample count:", recordingDataRef.current.length);

      if (recordingDataRef.current.length === 0) {
        setError("No data was collected during recording");
        return;
      }

      const newMotion: RecordedMotion = {
        motionName,
        timestamp: new Date().toISOString(),
        data: [...recordingDataRef.current],
      };

      setRecordedMotions((prev) => [...prev, newMotion]);
      setMotionName("");
      setSampleCount(0);
    }, 100);
  };

  const exportToCSV = () => {
    if (recordedMotions.length === 0) {
      setError("No motions recorded yet");
      return;
    }

    let csv =
      "Motion Name,Timestamp,Accel_X,Accel_Y,Accel_Z,Gyro_X,Gyro_Y,Gyro_Z,Temperature\n";

    recordedMotions.forEach((motion) => {
      motion.data.forEach((data) => {
        csv += `${motion.motionName},${motion.timestamp},`;
        csv += `${data.accel.x.toFixed(4)},${data.accel.y.toFixed(
          4
        )},${data.accel.z.toFixed(4)},`;
        csv += `${data.gyro.x.toFixed(4)},${data.gyro.y.toFixed(
          4
        )},${data.gyro.z.toFixed(4)},`;
        csv += `${data.temp.toFixed(2)}\n`;
      });
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `motion_data_${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const disconnect = async () => {
    if (device?.gatt?.connected) {
      await device.gatt.disconnect();
      setIsConnected(false);
      setSensorData(null);
      setIsCalibrated(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Motion Data Collection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Status: {isConnected ? "Connected" : "Disconnected"}
          </p>

          {sensorData && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium">Accelerometer (m/s²)</h3>
                  <p>X: {sensorData.accel.x.toFixed(2)}</p>
                  <p>Y: {sensorData.accel.y.toFixed(2)}</p>
                  <p>Z: {sensorData.accel.z.toFixed(2)}</p>
                </div>
                <div>
                  <h3 className="font-medium">Gyroscope (rad/s)</h3>
                  <p>X: {sensorData.gyro.x.toFixed(2)}</p>
                  <p>Y: {sensorData.gyro.y.toFixed(2)}</p>
                  <p>Z: {sensorData.gyro.z.toFixed(2)}</p>
                </div>
              </div>
              <div>
                <h3 className="font-medium">Temperature</h3>
                <p>{sensorData.temp.toFixed(2)}°C</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {isConnected ? (
            <>
              <div className="flex space-x-2">
                <Button onClick={disconnect} variant="destructive">
                  Disconnect
                </Button>
                <Button onClick={calibrateSensor} disabled={isCalibrated}>
                  {isCalibrated ? "Calibrated" : "Calibrate Sensor"}
                </Button>
              </div>

              <div className="space-y-2">
                <Input
                  placeholder="Enter motion name"
                  value={motionName}
                  onChange={(e) => setMotionName(e.target.value)}
                  disabled={isRecording}
                />
                <Button
                  onClick={startRecording}
                  disabled={isRecording || !motionName || !isCalibrated}
                  className="w-full"
                >
                  Start Recording
                </Button>
              </div>

              {isRecording && (
                <div className="space-y-2">
                  <Progress value={recordingProgress} />
                  <p className="text-sm text-gray-500 text-center">
                    Recording: {Math.round(recordingProgress)}% ({sampleCount}{" "}
                    samples)
                  </p>
                </div>
              )}
            </>
          ) : (
            <Button onClick={connectToBLE} className="w-full">
              Connect to MPU6050
            </Button>
          )}

          {recordedMotions.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Recorded Motions:</h3>
              {recordedMotions.map((motion, index) => (
                <div key={index} className="text-sm">
                  {motion.motionName}: {motion.data.length} samples
                </div>
              ))}
              <Button
                onClick={exportToCSV}
                variant="outline"
                className="w-full"
              >
                Export to CSV
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MotionDataCollector;
