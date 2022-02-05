ediplug
=======

**Control your Edimax Smart Plugs with Node.js**

[![NPM](https://nodei.co/npm/ediplug.png)](https://nodei.co/npm/ediplug/)

This module is inspired by
[mwittig/edimax-smartplug](https://github.com/mwittig/edimax-smartplug) but has
full TypeScript support and doesn't depend on Bluebird promises. Features like
scheduling and discovery are not included in this module. However, it includes
everything you need to control your plug and read its current power usage.  If
you would like it to include additional features, please file an issue or
submit a pull request.

:warning: To use this module, you will need to know the password of your plug.
If you don't know the password and it's not "1234" and you can't change or set
it in the app, chances are that you're using an up-to-date version of the
plug's firmware where Edimax has made it more difficult for their customers to
use third-party software to control their devices.

There is no need to panic. You have two options:

 - [Downgrade the firmware][downgrade-instructions] to an older version where
   the password will be "1234". Requires a Windows computer. _Not recommended._
 - [Set up the plug by following specific instructions][troubleshoot] in order
   to obtain the password during the setup process. Requires factory-resetting
   the device and a computer with a terminal and Telnet. _Recommended._

## Supported Devices

 - Edimax SP-2101W V2: Confirmed working and tested
 - Edimax SP-2101W: Probably works
 - Edimax SP-1101W V2: Probably works
 - Edimax SP-1101W: [Confirmed](https://github.com/maxkueng/ediplug/pull/7#issuecomment-933816945) working as of v1.1.0

## Installation

```sh
npm install --save ediplug
```

## Example

```js
import {
  RelayState,
  getDeviceInfo,
  getReport,
  setRelayState,
} from 'ediplug';

const options = {
  host: '10.13.37.10',
  password: 's3cr3t',
};

const deviceInfo = await getDeviceInfo(options);
console.log(deviceInfo);
// {
//   vendor: 'Edimax',
//   model: 'SP2101W_V2',
//   fwVersion: '3.00c',
//   mac: 'BADA55FA7A55'
// }

// Turn the relay on
await setRelayState(options, RelayState.On);

const report = await getReport(options);
console.log(report);
// {
//   relay: 'on',
//   power: 119.51,
//   current: 0.6813,
//   energyDay: 0.009,
//   energyWeek: 0.922,
//   energyMonth: 1.876
// }

console.log(report.relay === RelayState.On)
// true
```

## Documentation

### `interface Options`

Configuration options.

 - `timeout?: number` _(optional; default 10000)_: A timeout in milliseconds
   before requests to the plug get canceled and throw an error.
 - `host: string` _(required)_: The IP address of your plug. 
 - `port?: number` _(optional; default: 10000)_: The port your plug listens
   on. You probably don't need to change this unless your plug is behind a
   proxy. 
 - `username?: string` _(optional; default: "admin")_: The username to log in
   to the plug.
 - `password?: string` _(optional; default: "1234")_: The password to log in
   to the plug.

### `interface DeviceInfo`

Holds information about the device.

 - `vendor: string`: Name of the vendor of the plug. This is probably always
   "Edimax" but who knows.
 - `model: string`: Model name of the plug. For example: "SP2101W_V2".
 - `fwVersion: string`: Version of the firmware running on the plug.
 - `mac: string`: The device's MAC address.

### `enum RelayState`

 - `On = 'on'`: Plug relay "on" state
 - `Off = 'off'`: Plug relay "off" state

### `interface Report`

Status report of the plug.

 - `relay: RelayState`: Current on/off state of the relay. (See [RelayState](#enum-relaystate))
 - `power: number`: Current power consumption in watts.
 - `current: number`: Current current in ampere.
 - `energyDay: number`: Total energy usage today in W/h.
 - `energyWeek: number`: Total energy usage this week in W/h.
 - `energyMonth: number`: Total energy usage this month in W/h.


### `info = await getDeviceInfo(options: Options): Promise<DeviceInfo>`

Get information about the device.
See [Options](#interface-options), [DeviceInfo](#interface-deviceinfo).

### `relay = await getRelayState(options: Options): Promise<RelayState>`

Get the current state of the relay i.e. whether the plug is on or off.
See [Options](#interface-options), [RelayState](#enum-relaystate).

### `await setRelayState(options: Options, relay: RelayState): Promise<void>`

Set the relay state to `RelayState.On` or `RelayState.off` i.e. turn the relay
on or off.
See [Options](#interface-options), [RelayState](#enum-relaystate).

### `watts = await getCurrentPower(options: Options): Promise<number>`

Get the current power output of the plug in watts.
See [Options](#interface-options).

### `report = await getReport(options: Options): Promise<Report>`

Get a status report of the plug that contains relay state, power usage in
watts, current in ampere, as well as total energy usage of the current day,
week, and month.
See [Options](#interface-options), [Report](#interface-report).

### `await turnOn(options: Options): Promise<void>`

Turn the relay on. This is a shortcut for `setRelayState(options, RelayState.On)`.
See [Options](#interface-options).

### `await turnOff(options: Options): Promise<void>`

Turn the relay off. This is a shortcut for `setRelayState(options, RelayState.Off)`.
See [Options](#interface-options).

### `await toggle(options: Options): Promise<RelayState>`

Toggle the relay from off to on or from on to off. Returns the new state of the
relay.
See [Options](#interface-options), [RelayState](#enum-relaystate).

## Troubleshooting

### Getting The Password of Your Plug

At some point, Edimax decided that their customers should no longer know the
passwords to their plugs and changed their firmware to set a random password
during the setup process and hide it from the user.

However, a kind user on the Node-RED forum provided [step-by-step
instructions][setup-instructions] on how to obtain the generated password
during setup.

  1. Set up the plug as usual using the EdiSmart app and connect it to your
     Wifi. Then go to your router admin panel and find the IP assigned to the
     plug. In this example we'll assume that IP is `10.13.37.10`. Peferably,
     also assign a static lease to the MAC address of the plug so that the IP
     will always be the same.

  2. Delete the newly added plug from the app.

  3. Perform a factory reset on the plug by simultaneously pressing and holding
     both the "power switch" and "reset" buttons for 10+ seconds until the LEDs
     briefly flash green. The LEDs will then flash in red quickly. Wait for the
     plug to reboot until the LEDs flash in red _slowly_. This means it's now
     in "installation mode". See [Edimax FAQ][edimax-faq].

  4. Connect _both your smartphone and your computer_ to the "EdiPlug.Setup xx"
     wifi network that was created by the plug.

  5. On your PC, open http://192.168.20.3:10000/tnb2 in a browser. If prompted
     for a password, enter "admin" as the username and "1234" as the password.
     The response should read "OK".

     If "1234" did not work as the password then perhaps you only did a soft
     reset by holding only the "reset" button, instead of a full factory reset.
     In this case, go back to step 3 and repeat.

  6. On your smarphone, open the EdiSmart app.

  7. On your PC, connect back to your regular wifi.

  8. On your smartphone, proceed with the setup of the plug and choose the wifi
     network that it should use and provide the password. When prompted to
     enter a new for your plug, _do not proceed yet._

  9. As soon as you are prompted to enter a name for your plug, open a Telnet
     connection on port 1355 on the IP obtained in step 1:  
     `telnet 10.13.37.10 1355`

 10. In the Telnet session, type the command `nvc all`. The last line of the
     output should look like this:  
     `Device.System.Password.Password=1234`

 11. In the EdiSmart app, enter a name for your plug and confirm.

 12. Immediately after submitting the new name, repeatedly run the `nvc all`
     command in the Telnet session until the password in the last line changes
     from "1234" to the randomly generated password.

 13. You have now obtained your plug's password. Write it down because this is
     the last time you will ever see it. Do it quickly as the Telnet session
     will terminate once the plug has completed the setup.

## License

Copyright (c) 2020 Max Kueng

MIT License


[downgrade-instructions]: https://github.com/mwittig/edimax-smartplug/blob/master/Downgrade.md
[troubleshoot]: #troubleshooting
[setup-instructions]: https://discourse.nodered.org/t/searching-for-help-to-read-status-of-edimax-smartplug/15789/6
[edimax-faq]: https://www.edimax.com/edimax/catalog_faq/catalog_faq/data/edimax/global/faq/for_home/home_automation/home_automation_smart_plug/sp-2101w

