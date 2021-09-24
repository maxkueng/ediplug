import crypto from 'crypto';
import { Agent } from 'http';
import axios from 'axios';
import parser from 'fast-xml-parser';

export interface Options {
  timeout?: number;
  host: string;
  port?: number;
  username?: string;
  password?: string;
}

interface Config {
  timeout: number;
  host: string;
  port: number;
  username: string;
  password: string;
}

enum CommandType {
  Read = 'get',
  Write = 'setup',
}

const nc = {
  count: 0,
  get(): number {
    if (this.count === 99999999) {
      this.count = 0;
    }

    this.count += 1;
    return this.count;
  },
};

function getConfig(options: Options): Config {
  return {
    timeout: 10000,
    port: 10000,
    username: 'admin',
    password: '1234',
    ...options,
  };
}

function createCommand(type: CommandType, xml: string): string {
  return [
    '<?xml version="1.0" encoding="UTF8"?>',
    '<SMARTPLUG id="edimax">',
    `<CMD id="${type}">`,
    xml,
    '</CMD>',
    '</SMARTPLUG>',
  ].join('');
}

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex');
}

interface AuthChallenge {
  digest_realm: string;
  nonce: string;
  qop: string;
}

interface LoginCredentials {
  username: string;
  password: string;
}

enum ChallengeType {
  Basic,
  Digest,
  Unknown
};

function getAuthType(
  challenge: string,
): ChallengeType {
  const parts = challenge.split(' ');
  let challengeType = ChallengeType.Unknown;

  if (parts) {
    if (parts[0] === 'Basic') {
      challengeType = ChallengeType.Basic;
    } else if (parts[0] === 'Digest') {
      challengeType = ChallengeType.Digest;
    }
  }

  return challengeType;
}

function getBasicAuthHeader(
  credentials: LoginCredentials,
): string {
  const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  return [
    'Basic',
    auth,
  ].join(' ');
}

function getAuthHeader(
  credentials: LoginCredentials,
  method: string,
  uri: string,
  challengeHeader: string,
): string {
  const challenge = challengeHeader.split(', ')
    .map((part) => part.split('='))
    .reduce((memo, [key, value]) => ({
      ...memo,
      [key.toLowerCase().replace(/\s/g, '_')]: value.replace(/"/g, ''),
    }), {}) as AuthChallenge;

  const {
    digest_realm: realm,
    nonce,
    qop,
  } = challenge;

  const nonceCount = String(nc.get()).padStart(8, '0');
  const cnonce = crypto.randomBytes(24).toString('hex');
  const ha1 = md5(`${credentials.username}:${realm}:${credentials.password}`);
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);
  const response = md5(`${ha1}:${nonce}:${nonceCount}:${cnonce}:${qop}:${ha2}`);

  return [
    'Digest',
    [
      `username="${credentials.username}"`,
      `realm="${realm}"`,
      `nonce=${nonce}`,
      `uri="${uri}"`,
      `qop="${qop}"`,
      'algorithm="MD5"',
      `response="${response}"`,
      `nc="${nonceCount}"`,
      `cnonce="${cnonce}"`,
    ].join(','),
  ].join(' ');
}

async function sendCommand(
  config: Config,
  command: string,
  headers: { [key: string]: string } = {},
  failCount = 0,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const requestURI = '/smartplug.cgi';
  const requestURL = `http://${config.host}:${config.port}${requestURI}`;
  try {
    const response = await axios({
      method: 'POST',
      url: requestURL,
      responseType: 'text',
      timeout: config.timeout,
      httpAgent: new Agent({ keepAlive: true }),
      headers: {
        'Content-Type': 'application/xml',
        'Content-Length': command.length,
        ...headers,
      },
      data: command,
    });

    return parser.parse(response.data);
  } catch (err) {
    if (err.isAxiosError) {
      const {
        request,
        response,
      } = err;
      const challengeHeader = response?.headers['www-authenticate'];
      if (response?.status === 401) {
        if (failCount >= 3) {
          throw new Error('Authentication failed. Check credentials');
        }

        const { username, password } = config;
        const credentials = { username, password };

        const authType = getAuthType(challengeHeader);
        let authHeader;
        if (authType === ChallengeType.Digest) {
          authHeader = getAuthHeader(credentials, request.method, requestURI, challengeHeader);
        } else if (authType === ChallengeType.Basic) {
          authHeader = getBasicAuthHeader(credentials);
        } else {
          throw new Error('Authentication failed and the challenge type is unknown.');
        }

        return sendCommand(
          config,
          command,
          { Authorization: authHeader },
          failCount + 1,
        );
      }
    }
    throw err;
  }
}

interface DeviceInfo {
  vendor: string;
  model: string;
  fwVersion: string;
  mac: string;
}

export async function getDeviceInfo(options: Options): Promise<DeviceInfo> {
  const config = getConfig(options);
  const command = createCommand(
    CommandType.Read,
    [
      '<SYSTEM_INFO>',
      '<Run.Cus/>',
      '<Run.Model/>',
      '<Run.FW.Version/>',
      '<Run.LAN.Client.MAC.Address/>',
      '</SYSTEM_INFO>',
    ].join(''),
  );
  const response = await sendCommand(config, command);
  const systemInfo = response.SMARTPLUG?.CMD?.SYSTEM_INFO;
  if (systemInfo) {
    return {
      vendor: systemInfo['Run.Cus'],
      model: systemInfo['Run.Model'],
      fwVersion: systemInfo['Run.FW.Version'],
      mac: systemInfo['Run.LAN.Client.MAC.Address'],
    } as DeviceInfo;
  }

  throw new Error('getDeviceInfo: Unexpected response');
}

export enum RelayState {
  On = 'on',
  Off = 'off',
}

function getRelayStateFromValue(value: string): RelayState {
  switch (value) {
    case 'ON':
      return RelayState.On;
    case 'OFF':
      return RelayState.Off;
    default:
      throw new Error(`Unknown relay value ${value}`);
  }
}

export async function getRelayState(options: Options): Promise<RelayState> {
  const config = getConfig(options);
  const command = createCommand(
    CommandType.Read,
    '<Device.System.Power.State/>',
  );
  const response = await sendCommand(config, command);
  const cmd = response.SMARTPLUG?.CMD;
  if (cmd) {
    const relayValue = cmd['Device.System.Power.State'];
    return getRelayStateFromValue(relayValue);
  }
  throw new Error('getRelayState: Unexpected response');
}

function getRelayStateValue(state: RelayState): 'ON' | 'OFF' {
  switch (state) {
    case RelayState.On:
      return 'ON';
    case RelayState.Off:
      return 'OFF';
    default:
      throw new Error('Unexpected code reached');
  }
}

export async function setRelayState(options: Options, state: RelayState): Promise<void> {
  const config = getConfig(options);
  const command = createCommand(
    CommandType.Write,
    [
      '<Device.System.Power.State>',
      getRelayStateValue(state),
      '</Device.System.Power.State>',
    ].join(''),
  );
  const response = await sendCommand(config, command);
  const cmd = response.SMARTPLUG?.CMD;
  if (cmd !== 'OK') {
    throw new Error('setRelayState: Unexpected response');
  }
}

export async function getCurrentPower(options: Options): Promise<number> {
  const config = getConfig(options);
  const command = createCommand(
    CommandType.Read,
    [
      '<NOW_POWER>',
      '<Device.System.Power.NowPower/>',
      '</NOW_POWER>',
    ].join(''),
  );
  const response = await sendCommand(config, command);
  const nowPower = response.SMARTPLUG?.CMD?.NOW_POWER;
  if (nowPower) {
    return nowPower['Device.System.Power.NowPower'] as number;
  }
  throw new Error('getCurrentPower: Unexpected response');
}

export interface Report {
  relay: RelayState;
  power: number;
  current: number;
  energyDay: number;
  energyWeek: number;
  energyMonth: number;
}

export async function getReport(options: Options): Promise<Report> {
  const config = getConfig(options);
  const command = createCommand(
    CommandType.Read,
    [
      '<Device.System.Power.State/>',
      '<NOW_POWER/>',
    ].join(''),
  );
  const response = await sendCommand(config, command);
  const cmd = response.SMARTPLUG?.CMD;
  const nowPower = cmd?.NOW_POWER;

  if (cmd && nowPower) {
    return {
      relay: getRelayStateFromValue(cmd['Device.System.Power.State']),
      power: nowPower['Device.System.Power.NowPower'],
      current: nowPower['Device.System.Power.NowCurrent'],
      energyDay: nowPower['Device.System.Power.NowEnergy.Day'],
      energyWeek: nowPower['Device.System.Power.NowEnergy.Week'],
      energyMonth: nowPower['Device.System.Power.NowEnergy.Month'],
    } as Report;
  }
  throw new Error('getCurrentPower: Unexpected response');
}

export function turnOn(options: Options): Promise<void> {
  return setRelayState(options, RelayState.On);
}

export function turnOff(options: Options): Promise<void> {
  return setRelayState(options, RelayState.Off);
}

export async function toggle(options: Options): Promise<RelayState> {
  const state = await getRelayState(options);
  const newState = state === RelayState.Off ? RelayState.On : RelayState.Off;
  await setRelayState(options, newState);
  return newState;
}
