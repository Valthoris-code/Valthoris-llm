# APIs

**Versão:** 1.0.0

**Estado:** Em construção

---

# Objetivo

Este documento descreve todas as APIs utilizadas pela plataforma Valthoris.

A filosofia da Valthoris é combinar Inteligência Artificial com múltiplas fontes públicas de Threat Intelligence, reduzindo falsos positivos e aumentando a precisão das análises.

---

# Objetivos

- Integrar múltiplas APIs especializadas
- Cruzar informação de diferentes fontes
- Melhorar a deteção de fraude
- Reduzir falsos positivos
- Permitir expansão futura sem alterar a arquitetura

---

# Categorias de APIs

## Threat Intelligence

- AbuseIPDB
- VirusTotal
- AlienVault OTX
- GreyNoise
- MISP

---

## Phishing

- OpenPhish
- PhishTank
- URLHaus

---

## Malware

- MalwareBazaar
- URLHaus
- VirusTotal

---

## Credenciais Comprometidas

- Have I Been Pwned

---

## Spam

- Spamhaus

---

## DNS e Domínios

- WHOIS
- RDAP
- DNS over HTTPS
- crt.sh

---

## Vulnerabilidades

- CVE
- NVD
- MITRE ATT&CK
- CISA Known Exploited Vulnerabilities (KEV)

---

## Geolocalização

- IP Geolocation
- ASN Lookup

---

## Criptomoedas

- Blockchain Explorers
- Etherscan
- Blockchair

---

# Gestão de APIs

A plataforma deverá suportar:

- Chaves de API
- Rate Limiting
- Cache
- Retry automático
- Timeout
- Fallback entre APIs
- Monitorização
- Logs
- Métricas

---

# Integração

As APIs comunicarão com:

- Valthoris AI
- AutoShield
- Threat Intelligence
- Backend
- Supabase
- ICP

---

# Evolução

Novas APIs poderão ser adicionadas sem necessidade de alterar a arquitetura principal da plataforma.

---

> Documento em construção.