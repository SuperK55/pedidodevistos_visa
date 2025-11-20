I need urgently a powerful n8n workflow for the Portuguese visa portal (pedidodevistos.mne.gov.pt) before Friday morning (Nov 21).

Requirements:
- Parallel execution of 10–15 accounts at the same time (I have ~100 accounts total)
- Rotate residential proxies (1 proxy per session/account)
- CapSolver integration for hCaptcha + Turnstile (I provide API key)
- Auto-login → go to appointment page → auto-refresh & book first available slot
- Telegram/WhatsApp notification when slot is booked
- Must run on VPS (Docker/Ubuntu)

The site updated Cloudflare protection yesterday, so it needs to be rock-solid.

Deadline: 100% working & tested by Thursday night (Nov 20)
Budget: 550–650 EUR fixed (express payment + bonus if delivered early)

I can give you right now:
– CapSolver key
– Proxy list (Portugal/Europe residential)
– Test accounts
– VPS access if needed




CAP-AAAAD7EA89937E8CD6DD03158747B46E84F7D4E55F74DC4CBD6FBA6C02891BB2

Vps acess i Will Send you later because i have to buy


proxy.soax.com:9000:Fg2bMz06fhV8h3ba:wifi;al;
proxy.soax.com:9001:Fg2bMz06fhV8h3ba:wifi;al;
proxy.soax.com:9002:Fg2bMz06fhV8h3ba:wifi;ao;
proxy.soax.com:9003:Fg2bMz06fhV8h3ba:wifi;ao;
proxy.soax.com:9004:Fg2bMz06fhV8h3ba:wifi;ao;
proxy.soax.com:9005:Fg2bMz06fhV8h3ba:wifi;ca;
proxy.soax.com:9006:Fg2bMz06fhV8h3ba:wifi;ca;
proxy.soax.com:9007:Fg2bMz06fhV8h3ba:wifi;ca;
proxy.soax.com:9008:Fg2bMz06fhV8h3ba:wifi;ca;
proxy.soax.com:9009:Fg2bMz06fhV8h3ba:wifi;ca;
proxy.soax.com:9010:Fg2bMz06fhV8h3ba:wifi;ca;
proxy.soax.com:9011:Fg2bMz06fhV8h3ba:wifi;cm;
proxy.soax.com:9012:Fg2bMz06fhV8h3ba:wifi;cm;
proxy.soax.com:9013:Fg2bMz06fhV8h3ba:wifi;cm;
proxy.soax.com:9014:Fg2bMz06fhV8h3ba:wifi;cm;
Login:zuca2030
Password: Saulooliveira2020@

http://tampermonkey.net/

// ==UserScript==
// @name        Automação de Preenchimento de Formulários de Visto
// @namespace  http://tampermonkey.net/
// @version    2024-04-19
// @description Automação para preencher formulários de visto no site pedidodevistos.mne.gov.pt
// @author      Você
// @match      https://pedidodevistos.mne.gov.pt/VistosOnline/*
// @icon        https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net
// @grant      none
// ==/UserScript==

(function () {
    'use strict';

    // Lista de dados das pessoas
    const pessoas = [
        {
            email: "matildeoliveiracabral34@gmail.com",
            nome_completo: "Gomes",
            nome_pai: "Leonardo",
            nascimento: "2007/01/13",
            local_nascimento: "Santiago",
            passaporte: "PA4284766",
            validade_passaporte: { inicio: "2024/04/15", fim: "2029/04/14" },
            motivo: "Ferias",
            data_viagem: { partida: "2026/01/17", retorno: "2026/01/30" },
            patrocinador: "Carlos Antonio Correia Morais Chantre",
            endereco_patrocinador: "R Bombeiro voluntarios 3A Loures"
        }
        // Adicione mais pessoas aqui, se necessário
    ];

    let currentIndex = 0; // Índice da pessoa atual

    function preencherFormularioQuestionario() {
        $('#mainContent').append('<form name="questForm" id="questForm" class="form" method="post" action="Formulario"></form>');
        $("#questForm").append(
            '<input type="hidden" name="lang" value="PT">' +
            '<input type="hidden" name="nacionalidade" id="nacionalidade" value="CPV">' +
            '<input type="hidden" name="pais_residencia" id="pais_residencia" value="CPV">' +
            '<input type="hidden" name="tipo_passaporte" id="tipo_passaporte" value="01">' +
            '<input type="hidden" name="copia_pedido" id="copia_pedido" value="null">' +
            '<input type="hidden" id="cb_next_1" name="cb_next_1" value="21">' +
            '<input type="hidden" id="cb_next_21" value="2">' +
            '<input type="hidden" id="cb_next_2" value="3">' +
            '<input type="hidden" id="cb_next_3" value="5">' +
            '<input type="hidden" id="cb_next_5" value="6">' +
            '<input type="hidden" id="cb_next_6" value="16">' +
            '<input type="hidden" id="tipo_visto" name="tipo_visto" value="C">' +
            '<input type="hidden" id="tipo_visto_desc" name="tipo_visto_desc" value="VISTO DE CURTA DURAÇÃO">' +
            '<input type="hidden" id="class_visto" name="class_visto" value="SCH">' +
            '<input type="hidden" id="cod_estada" name="cod_estada" value="10">' +
            '<input type="hidden" id="id_visto_doc" name="id_visto_doc" value="36">'
        );
        document.questForm.submit();
    }

    function preencherFormularioPrincipal(pessoa) {
        $("input[name='f0']").val(pessoa.email).change();
        $("select[name='f0sf1']").val("5084").change();
        $("input[name='f1']").val(pessoa.nome_completo).change();
        $("input[name='f2']").val(pessoa.nome_completo).change();
        $("input[name='f3']").val(pessoa.nome_pai).change();
        $("input[name='f4']").val(pessoa.nascimento).change();
        $("input[name='f6']").val(pessoa.local_nascimento).change();
        $("select[name='f6sf1']").val("CPV").change();
        $("select[name='f7sf1']").val("CPV").change();
        $("select[name='f8']").val("CPV").change();
        $("input[name='f45']").val("Praia").change();
        $("input[name='f46']").val("9951033").change();
        $("select[name='f10']").val("1").change();
        $("select[name='f13']").val("01").change();
        $("select[name='f19']").val("14").change();
        $("input[name='f20sf1']").val("Irmaos Correia").change();
        $("input[name='f20sf2']").val("Achada Grande Frente").change();
        $("input[name='f14']").val(pessoa.passaporte).change();
        $("input[name='f16']").val(pessoa.validade_passaporte.inicio).change();
        $("input[name='f17']").val(pessoa.validade_passaporte.fim).change();
        $("select[name='f15']").val("CPV").change();
        $("input[name='txtInfoMotEstada']").val(pessoa.motivo).change();
        $("select[name='f32']").val("PRT").change();
        $("input[name='f25']").val("15").change();
        $("select[name='f34sf5']").val("6").change();
        $("input[name='f30']").val(pessoa.data_viagem.partida).change();
        $("input[name='f31']").val(pessoa.data_viagem.retorno).change();
        $("select[name='cmbDespesasRequerente_1']").val("1").change();
        $("select[name='cmbDespesasPatrocinador_1']").val("2").change();
        $("input[name='f34']").val(pessoa.patrocinador).change();
        $("input[name='f34sf2']").val(pessoa.endereco_patrocinador).change();

        // Submetendo o formulário
        document.vistoForm.submit();
    }

    function handlePage() {
        const url = window.location.href;

        if (currentIndex >= pessoas.length) {
            console.log("Todas as pessoas foram processadas.");
            return;
        }

        if (url.includes("Questionario")) {
            preencherFormularioQuestionario();
        } else if (url.includes("Formulario")) {
            preencherFormularioPrincipal(pessoas[currentIndex]);
            currentIndex++; // Avança para a próxima pessoa
        } else if (url === "https://pedidodevistos.mne.gov.pt/VistosOnline/") {
            console.log("Executando questionário na página principal...");
            preencherFormularioQuestionario();
        }
    }

    // Executa o script ao carregar a página
    window.addEventListener('load', handlePage);
})();


Hi Andrii,

One very important clarification about the Tampermonkey script I sent:

The script I sent fills perfectly:
→ Questionnaire page (Questionario)
→ Main applicant form (Formulario)
→ and submits everything until the calendar/search page

BUT it does **NOT** yet include the final part:
→ Selecting the consulate/posto
→ Clicking “Pesquisar” (search availability)
→ Detecting available dates/times on the calendar
→ Selecting the first available slot
→ Confirming and submitting the final appointment

This final part is missing in the script because it changes every week (different consulates, different available dates, etc.) and needs to be dynamic.

So please, in the n8n workflow, you need to **add this final automation after the Formulario is submitted**:

1. Wait for the calendar/search page to load (URL contains RequisicaoMarcar.aspx or similar)
2. Select the correct consulate/posto from dropdown (I will give you the exact ID/value per account in the Excel – e.g. Recife = 5084, Lisboa = XXX, etc.)
3. Click the “Pesquisar” or “Procurar” button
4. Wait for the calendar or time slots to appear
5. Automatically detect and click the FIRST available green/clickable date & time
6. Click “Confirmar” / “Marcar”
7. If successful → capture the confirmation number/date/time and send Telegram notification immediately
8. If no slots → optional: refresh every 5–10 seconds until slots appear (or just end and try next account)



