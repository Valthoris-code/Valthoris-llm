# Internet Computer Protocol (ICP)

**Versão:** 1.0.0

**Estado:** Em construção

---

# Objetivo

Este documento descreve a arquitetura da Internet Computer Protocol (ICP) utilizada pela plataforma Valthoris.

A Aetheris utilizará uma arquitetura modular baseada em canisters próprios, concebida para garantir escalabilidade, segurança, elevada disponibilidade e facilidade de manutenção.

Sempre que possível serão reutilizados e evoluídos os canisters originalmente desenvolvidos para a AntiFraudApp.

---

# Objetivos da Arquitetura

- Descentralização da lógica crítica.
- Elevada disponibilidade.
- Escalabilidade horizontal.
- Atualizações independentes por módulo.
- Comunicação segura entre canisters.
- Baixo acoplamento entre componentes.
- Facilidade de expansão futura.

---

# Infraestrutura Atual

## Main Account

104dee7379ce645064c4b24b531b08f85169b729e85713fdadaa7a34c010f368

## Controller Principal

6wzpv-jfxnt-kzbeg-4isuv-vd2m2-yfzmk-znnho-tpvrg-lmarn-afsnw-tae

---

# Canisters Existentes

## Frontend

Canister ID

v63rh-lqaaa-aaaaa-qewvq-cai

Estado

Será reutilizado.

Responsabilidades

- Interface Web
- PWA
- Comunicação com Backend

---

## Backend Core

Canister ID

c6sjf-tqaaa-aaaap-qsiea-cai

Estado

Será reutilizado e expandido.

Responsabilidades

- Coordenação dos serviços
- Gestão de pedidos
- Comunicação entre módulos

---

## Community

Canister ID

7w5qg-6aaaa-aaaab-ael4a-cai

Antigo nome

Denúncias

Responsabilidades

- Denúncias
- Comunidade
- Reputação
- Validação colaborativa

---

## Identity

Canister ID

ezroe-caaaa-aaaac-bcdeq-cai

Antigo nome

Contact Lookup

Responsabilidades

- Pesquisa de contactos
- Reputação
- Identificação

---

## Threat Intelligence

Canister ID

e2m3q-yqaaa-aaaas-qekva-cai

Antigo nome

Public Data

Responsabilidades

- IOC
- Phishing
- Malware
- Spam
- URLs
- IPs
- Domínios

---

## Safe Location

Canister ID

sodv3-uiaaa-aaaak-qxubq-cai

Antigo nome

Real Location

Responsabilidades

- Localização segura
- Geofencing
- Partilha temporária de localização

---

# Canisters Planeados

Durante o desenvolvimento poderão ser criados novos canisters especializados.

## AI Core

Responsável pela integração da Inteligência Artificial.

---

## AutoShield

Motor de proteção em tempo real.

---

## Crypto Intelligence

Análise de fraude relacionada com criptomoedas.

---

## Notifications

Gestão de notificações.

---

## API Gateway

Comunicação segura entre aplicações, APIs públicas e restantes canisters.

---

# Comunicação

Todos os canisters deverão comunicar através de interfaces bem definidas.

A comunicação deverá privilegiar:

- Baixa latência
- Segurança
- Escalabilidade
- Tolerância a falhas

---

# Integrações

Os canisters poderão comunicar com:

- Supabase
- APIs públicas
- Modelo Aetheris AI
- Aplicações Android
- Aplicações iOS
- Aplicação Web

---

# Evolução

A arquitetura ICP será continuamente revista para acomodar novas funcionalidades e otimizações sem comprometer a estabilidade da plataforma.

---

> Documento em construção.