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

  const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
  const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

  const connectToBLE = async () => {
    try {
      const selectedDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [CHARACTERISTIC_UUID],
      });

      setDevice(selectedDevice);

      selectedDevice.addEventListener("gattserverdisconnected", () => {
        setIsConnected(false);
        setError("Device disconnected");
      });

      if (!selectedDevice.gatt) {
        throw new Error("No GATT interface found on this device.");
      }

      const server = await selectedDevice.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(
        CHARACTERISTIC_UUID
      );

      setCharacteristic(characteristic);
      setIsConnected(true);
      setError("");

      characteristic.addEventListener("characteristicvaluechanged", (event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic;
        const data = target?.value;
        if (!data) return;
        const value = new TextDecoder().decode(data);
        setValue(value);
      });
      await characteristic.startNotifications();
    } catch (error) {
      setError((error as Error).message);
      setIsConnected(false);
    }
  };

  const disconnect = async () => {
    if (device && device.gatt && device.gatt.connected) {
      await device.gatt.disconnect();
      setIsConnected(false);
      setValue("");
    }
  };

  const sendMessage = async () => {
    if (characteristic) {
      try {
        const encoder = new TextEncoder();
        await characteristic.writeValue(encoder.encode("Hello from Web"));
      } catch (error) {
        setError((error as Error).message);
      }
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
            Status: {isConnected ? "Connected" : "Disconnected"}
          </p>
          {value && <p className="text-sm">Received: {value}</p>}
        </div>

        <div className="space-x-2">
          {!isConnected ? (
            <Button onClick={connectToBLE}>Connect to ESP32</Button>
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
