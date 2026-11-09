// Publica o Correção da Hora na VPS pelo Coolify (API). Roda NA VPS, como usuário claude.
//   node scripts/coolify-publicar.mjs            → cria projeto, chave de leitura e app na 1ª vez e faz o deploy
//   node scripts/coolify-publicar.mjs --deploy   → só novo deploy (depois de push na main)
// Token do Coolify: ~/.config/coolify-token (600). Nunca no código. IDs (não secretos): ~/.config/criafacil-coolify.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API = (process.env.COOLIFY_URL || 'http://127.0.0.1:8000') + '/api/v1';
const IP = '185.205.246.103';
const DOMINIO = `https://correcao.${IP}.sslip.io`; // sem DNS manual; domínio koamind entra depois
const REPO = 'FutureCriativo/cria-facil';
const IDS = path.join(os.homedir(), '.config/criafacil-coolify.json');
const TOKEN_ARQ = path.join(os.homedir(), '.config/coolify-token');

const token = fs.existsSync(TOKEN_ARQ) ? fs.readFileSync(TOKEN_ARQ, 'utf8').trim() : '';
if (!token) { console.error(`Falta o token do Coolify em ${TOKEN_ARQ}`); process.exit(1); }
const ids = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, 'utf8')) : {};
const salvar = () => fs.writeFileSync(IDS, JSON.stringify(ids, null, 2), { mode: 0o600 });

async function api(metodo, rota, corpo) {
  const r = await fetch(API + rota, { method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  if (!r.ok) throw new Error(`${metodo} ${rota} -> HTTP ${r.status}: ${(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 300)}`);
  return d;
}
const passo = (t) => console.log('- ' + t);

async function deploy() {
  passo('Disparando deploy');
  let r; try { r = await api('POST', `/deploy?uuid=${ids.app}&force=false`); } catch { r = await api('GET', `/deploy?uuid=${ids.app}&force=false`); }
  console.log('  ', JSON.stringify(r).slice(0, 200));
}

async function criar() {
  if (!ids.server) {
    const s = await api('GET', '/servers');
    ids.server = (s.find((x) => x.ip === 'host.docker.internal' || x.name === 'localhost') || s[0]).uuid; salvar();
  }
  if (!ids.projeto) {
    ids.projeto = (await api('POST', '/projects', { name: 'Correção da Hora', description: 'App de hora de saída (Koa Mind, uso pessoal)' })).uuid; salvar();
    passo('Projeto criado');
  }
  const proj = await api('GET', `/projects/${ids.projeto}`);
  const env = (proj.environments || []).find((e) => e.name === 'production') || proj.environments?.[0];
  const ambiente = { project_uuid: ids.projeto, server_uuid: ids.server, environment_name: env?.name || 'production', ...(env?.uuid ? { environment_uuid: env.uuid } : {}) };

  if (!ids.chave) { // chave de leitura do repositório (só leitura)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfk-'));
    try {
      execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'coolify-cria-facil', '-f', path.join(dir, 'k'), '-q']);
      const pub = fs.readFileSync(path.join(dir, 'k.pub'), 'utf8').trim();
      const priv = fs.readFileSync(path.join(dir, 'k'), 'utf8');
      ids.chave = (await api('POST', '/security/keys', { name: 'cria-facil-deploy', description: 'Leitura do repo cria-facil', private_key: priv })).uuid;
      execFileSync('gh', ['api', `repos/${REPO}/keys`, '-f', 'title=Coolify VPS (leitura)', '-f', `key=${pub}`, '-F', 'read_only=true'], { stdio: 'ignore' });
      salvar(); passo('Chave de leitura criada');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  if (!ids.app) {
    const r = await api('POST', '/applications/private-deploy-key', {
      ...ambiente, private_key_uuid: ids.chave, git_repository: `git@github.com:${REPO}.git`, git_branch: 'main',
      build_pack: 'dockerfile', ports_exposes: '80', name: 'correcao-da-hora', description: 'Correção da Hora (PWA)',
      domains: DOMINIO, is_force_https_enabled: true, is_auto_deploy_enabled: false, instant_deploy: false,
      health_check_enabled: true, health_check_path: '/health', health_check_port: '80',
    });
    ids.app = r.uuid; salvar(); passo(`App criado (${DOMINIO})`);
  }
}

if (process.argv.includes('--deploy') && ids.app) await deploy();
else { await criar(); await deploy(); }
console.log('Endereço:', DOMINIO);
