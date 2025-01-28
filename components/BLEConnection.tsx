"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const BLEConnection = () => {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [characteristic, setCharacteristic] =
    useState<BluetoothRemoteGATTCharacteristic | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
  const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

  const connectToBLE = async () => {
    setIsScanning(true);
    setError("");

    try {
      console.log("Starting BLE device scan...");
      const selectedDevice = await navigator.bluetooth.requestDevice({
        // Try with acceptAllDevices first
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      });

      console.log("Device selected:", selectedDevice.name);
      setDevice(selectedDevice);

      selectedDevice.addEventListener("gattserverdisconnected", () => {
        console.log("Device disconnected");
        setIsConnected(false);
        setError("Device disconnected - Please try reconnecting");
      });

      if (!selectedDevice.gatt) {
        throw new Error("No GATT interface found on this device.");
      }

      console.log("Connecting to GATT server...");
      const server = await selectedDevice.gatt.connect();

      console.log("Getting primary service...");
      const service = await server.getPrimaryService(SERVICE_UUID);

      console.log("Getting characteristic...");
      const characteristic = await service.getCharacteristic(
        CHARACTERISTIC_UUID
      );

      setCharacteristic(characteristic);
      setIsConnected(true);
      setError("");

      // Set up notification handling
      characteristic.addEventListener("characteristicvaluechanged", (event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const data = target?.value;
        if (!data) {
          console.warn("Received empty data from device");
          return;
        }
        const value = new TextDecoder().decode(data);
        console.log("Received value from device:", value);
        setValue(value);
      });

      console.log("Starting notifications...");
      await characteristic.startNotifications();
      console.log("BLE connection and notifications established successfully");
    } catch (error) {
      console.error("BLE Error:", error);
      let errorMessage = (error as Error).message;

      // More user-friendly error messages
      if (errorMessage.includes("User cancelled")) {
        errorMessage = "Device selection was cancelled";
      } else if (errorMessage.includes("GATT")) {
        errorMessage = "Failed to connect to device - Please try again";
      } else if (errorMessage.includes("Service")) {
        errorMessage =
          "Device is not compatible - Please check if it's the correct ESP32";
      }

      setError(errorMessage);
      setIsConnected(false);
    } finally {
      setIsScanning(false);
    }
  };

  const disconnect = async () => {
    try {
      if (device?.gatt?.connected) {
        console.log("Disconnecting from device...");
        await device.gatt.disconnect();
        console.log("Successfully disconnected");
        setIsConnected(false);
        setValue("");
      }
    } catch (error) {
      console.error("Disconnect error:", error);
      setError(`Failed to disconnect: ${(error as Error).message}`);
    }
  };

  const sendMessage = async () => {
    if (!characteristic) {
      setError("No device connected");
      return;
    }

    try {
      console.log("Sending message to device...");
      const encoder = new TextEncoder();
      await characteristic.writeValue(encoder.encode("Hello from Web"));
      console.log("Message sent successfully");
    } catch (error) {
      console.error("Send error:", error);
      setError(`Failed to send message: ${(error as Error).message}`);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>ESP32 BLE Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            Status:{" "}
            {isScanning
              ? "Scanning..."
              : isConnected
              ? "Connected"
              : "Disconnected"}
          </p>
          {device?.name && (
            <p className="text-sm text-gray-500">Device: {device.name}</p>
          )}
          {value && <p className="text-sm">Received: {value}</p>}
        </div>

        <div className="space-x-2">
          {!isConnected ? (
            <Button
              onClick={connectToBLE}
              disabled={isScanning}
              className="min-w-[150px]"
            >
              {isScanning ? "Scanning..." : "Connect to ESP32"}
            </Button>
          ) : (
            <>
              <Button onClick={disconnect} variant="destructive">
                Disconnect
              </Button>
              <Button onClick={sendMessage}>Send Test Message</Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default BLEConnection;
