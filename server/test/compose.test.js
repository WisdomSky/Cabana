import test from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import {
  analyzeCompose,
  appDataIdFor,
  parseComposeYaml,
  parsePublishedPorts,
  projectName,
  safeAppId,
  substituteCasaVariables,
  translateCompose,
} from '../src/services/compose.js';

const STORE_COMPOSE = `name: uptimekuma
services:
  uptimekuma:
    image: louislam/uptime-kuma:2
    container_name: uptimekuma
    network_mode: bridge
    ports:
      - target: 3001
        published: "3001"
        protocol: tcp
    restart: unless-stopped
    volumes:
      - type: bind
        source: /DATA/AppData/$AppID/app/data
        target: /app/data
    environment:
      PUID: $PUID
      PGID: \${PGID}
      TZ: \${TZ:-Europe/Berlin}
      OTHER: $OTHER
x-casaos:
  id: org.icewhale.uptimekuma
  main: uptimekuma
  index: /
  port_map: "3001"
  title:
    en_US: Uptime Kuma
`;

test('CasaOS variable substitution handles plain, braced, and default values', () => {
  const out = substituteCasaVariables(
    'a=$AppID b=${AppID} c=$PUID d=${PGID} e=${TZ} f=${TZ:-UTC} g=$TZ h=$OTHER',
    { appId: 'uptimekuma', puid: 1000, pgid: 1001, tz: 'Asia/Tokyo' },
  );
  assert.equal(out, 'a=uptimekuma b=uptimekuma c=1000 d=1001 e=Asia/Tokyo f=Asia/Tokyo g=Asia/Tokyo h=$OTHER');
});

test('store compose translation honors the CasaOS contract and adds Cabana labels', () => {
  const translated = translateCompose(STORE_COMPOSE, {
    appId: 'org.icewhale.uptimekuma',
    appDataId: 'uptimekuma',
    title: 'Uptime Kuma',
    source: 'store',
    project: 'cabana_org_icewhale_uptimekuma',
    puid: 1000,
    pgid: 1001,
    tz: 'UTC',
  });
  const doc = YAML.parse(translated.yaml);
  const service = doc.services.uptimekuma;
  assert.equal(service.container_name, 'uptimekuma');
  assert.equal(service.labels['cabana.managed'], 'true');
  assert.equal(service.labels['cabana.app.id'], 'org.icewhale.uptimekuma');
  assert.equal(service.labels['cabana.app.source'], 'store');
  assert.equal(service.labels['cabana.app.service'], 'uptimekuma');
  assert.equal(service.environment.PUID, 1000);
  assert.equal(service.environment.PGID, 1001);
  assert.equal(service.environment.TZ, 'UTC');
  assert.equal(service.environment.OTHER, '$OTHER');
  assert.equal(service.volumes[0].source, '/DATA/AppData/uptimekuma/app/data');
  assert.equal(translated.mainService, 'uptimekuma');
  assert.equal(translated.portMap, '3001');
  assert.equal(translated.scheme, 'http');
  assert.equal(translated.index, '/');
  assert.deepEqual(translated.dataPaths, ['/DATA/AppData/uptimekuma/app/data']);
  assert.ok(translated.containerNames.includes('uptimekuma'));
});

test('translation remaps /DATA bind sources when a custom data dir is configured', () => {
  const translated = translateCompose(STORE_COMPOSE, {
    appId: 'org.icewhale.uptimekuma',
    appDataId: 'uptimekuma',
    source: 'store',
    project: 'p',
    dataDir: '/srv/cabana-data',
  });
  assert.equal(
    YAML.parse(translated.yaml).services.uptimekuma.volumes[0].source,
    '/srv/cabana-data/AppData/uptimekuma/app/data',
  );
  assert.deepEqual(translated.dataPaths, ['/srv/cabana-data/AppData/uptimekuma/app/data']);
});

test('services without a container name get a stable project-scoped name', () => {
  const translated = translateCompose(
    `services:
  web:
    image: nginx:alpine
    ports: ["8080:80"]
`,
    { appId: 'demo', appDataId: 'demo', source: 'custom', project: 'cabana_demo' },
  );
  const doc = YAML.parse(translated.yaml);
  assert.equal(doc.services.web.container_name, 'cabana_demo-web');
  assert.equal(doc.services.web.restart, 'unless-stopped');
  assert.deepEqual(translated.containerNames, ['cabana_demo-web']);
  assert.equal(translated.portMap, '8080');
});

test('dangerous custom Compose settings are reported', () => {
  const doc = parseComposeYaml(`services:
  risky:
    image: busybox
    privileged: true
    network_mode: host
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /:/host
`);
  const warnings = analyzeCompose(doc);
  const codes = warnings.map((w) => w.code);
  assert.ok(codes.includes('privileged'));
  assert.ok(codes.includes('host_network'));
  assert.ok(codes.includes('docker_socket'));
  assert.ok(codes.includes('sensitive_mount'));
});

test('loopback-only ports produce a reachability warning', () => {
  const translated = translateCompose(
    `services:
  local:
    image: nginx:alpine
    ports:
      - "127.0.0.1:8088:80"
`,
    { appId: 'local', appDataId: 'local', source: 'custom', project: 'cabana_local' },
  );
  assert.ok(translated.warnings.some((w) => w.code === 'loopback_port'));
});

test('port parsing supports short, long, ranges, UDP and container-only syntax', () => {
  assert.deepEqual(parsePublishedPorts({ ports: ['8080:80'] })[0], {
    hostPort: '8080',
    containerPort: '80',
    protocol: 'tcp',
    hostIp: '0.0.0.0',
  });
  assert.deepEqual(parsePublishedPorts({ ports: ['127.0.0.1:9000:90/udp'] })[0], {
    hostPort: '9000',
    containerPort: '90',
    protocol: 'udp',
    hostIp: '127.0.0.1',
  });
  const range = parsePublishedPorts({ ports: ['9001-9003:80-82'] });
  assert.deepEqual(range.map((p) => p.hostPort), ['9001', '9002', '9003']);
  assert.equal(parsePublishedPorts({ ports: ['3000'] })[0].hostPort, null);
  assert.equal(parsePublishedPorts({ ports: [{ target: 80, published: 8081, host_ip: '0.0.0.0' }] })[0].hostPort, '8081');
});

test('invalid Compose input is rejected with actionable errors', () => {
  assert.throws(() => parseComposeYaml('not: [valid'), /not valid YAML/i);
  assert.throws(() => parseComposeYaml('services: {}'), /at least one service/i);
  assert.throws(() => parseComposeYaml('services:\n  a:\n    build: .\n'), /uses "build"/i);
  assert.throws(() => parseComposeYaml('services:\n  a:\n    image: x\ninclude:\n  - other.yml\n'), /include/i);
  assert.throws(() => parseComposeYaml('services:\n  a:\n    image: x\n    extends:\n      file: y\n'), /extends/i);
});

test('app ids, data folders and project names are normalized safely', () => {
  assert.equal(safeAppId('org.icewhale.uptimekuma'), 'org.icewhale.uptimekuma');
  assert.equal(safeAppId('../evil'), null);
  assert.equal(safeAppId('has space'), null);
  assert.equal(appDataIdFor('org.icewhale.uptimekuma'), 'uptimekuma');
  assert.equal(appDataIdFor('com.example.app', 'custom-app'), 'custom-app');
  assert.equal(projectName('org.icewhale.uptimekuma'), 'cabana_org_icewhale_uptimekuma');
  assert.ok(projectName('a'.repeat(100)).length <= 63);
});
