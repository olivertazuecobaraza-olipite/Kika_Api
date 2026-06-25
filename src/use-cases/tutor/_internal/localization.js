export const LANGUAGE_PROFILES = {
    en: { languageName: 'English', localeHint: 'en' },
    es: { languageName: 'Spanish', localeHint: 'es' },
    pt: { languageName: 'Portuguese', localeHint: 'pt' },
    fr: { languageName: 'French', localeHint: 'fr' },
    ca: { languageName: 'Catalan', localeHint: 'ca' },
    gl: { languageName: 'Galician', localeHint: 'gl' },
    eu: { languageName: 'Basque', localeHint: 'eu' },
    de: { languageName: 'German', localeHint: 'de' },
    it: { languageName: 'Italian', localeHint: 'it' },
    ru: { languageName: 'Russian', localeHint: 'ru' },
    zh: { languageName: 'Chinese', localeHint: 'zh' },
    ja: { languageName: 'Japanese', localeHint: 'ja' },
    ar: { languageName: 'Arabic', localeHint: 'ar' },
    ko: { languageName: 'Korean', localeHint: 'ko' }
};


export const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const localizedCopy = {
    en: {
        unavailableTitle: 'Information not available in the documentation',
        unavailableBody: 'I do not find enough information in the course documentation to answer this query safely:',
        unavailableHint: 'You can rephrase the question by indicating the topic, module, section or page you want to consult.',
        ambiguousTitle: 'More detail needed',
        ambiguousBody: 'I need a more specific reference to answer this safely from the course documentation:',
        ambiguousHint: 'Please indicate the topic, module, section, page or previous message you want to consult.',
        externalTitle: 'Outside the available documentation',
        externalBody: 'That requires external knowledge. I cannot answer it unless web search is enabled:',
        externalHint: 'If you want me to consult the internet, enable web_search or include "Busca en internet" in the request.',
        smalltalkTitle: 'Ready to help',
        identityTitle: 'Course documentation tutor',
        helpTitle: 'How I can help',
        smalltalk: "I'm here. I can chat briefly, but my main job is helping you with the course documentation.",
        identity: 'I am Kika, a tutor specialized in the course documentation. I can chat briefly, locate, explain, summarize and clarify information from that source, and I only use internet search when web_search is enabled.',
        identityItems: ['Locate information in the available documentation.', 'Explain, summarize and clarify course content without inventing unsupported details.', 'Use internet search only when web_search is enabled.'],
        help: 'I can help you work with the course documentation and keep brief conversational context without inventing unsupported course information.',
        helpItems: ['Ask about a course topic, module, section or page.', 'Request summaries, explanations or structured lists.', 'Ask me to compare sections when both are in the documentation.', 'Ask simple conversational or usage questions.', 'Enable web_search or write "Busca en internet" to complement with external sources.'],
        sourcesTitle: 'Internet sources'
    },
    es: {
        unavailableTitle: 'Informacion no disponible en la documentacion',
        unavailableBody: 'No encuentro esa informacion en la documentacion del curso para responder con seguridad a la consulta:',
        unavailableHint: 'Puede reformular la pregunta indicando el tema, modulo, apartado o pagina concreta que quiere consultar.',
        ambiguousTitle: 'Necesito mas precision',
        ambiguousBody: 'Necesito una referencia mas concreta para responder con seguridad desde la documentacion del curso:',
        ambiguousHint: 'Indique el tema, modulo, apartado, pagina o mensaje anterior que quiere consultar.',
        externalTitle: 'Fuera de la documentacion disponible',
        externalBody: 'Eso requiere conocimiento externo. No puedo responderlo salvo que la busqueda web este activada:',
        externalHint: 'Si quiere que lo consulte en internet, active web_search o incluya "Busca en internet" en la peticion.',
        smalltalkTitle: 'Listo para ayudar',
        identityTitle: 'Tutor de documentacion del curso',
        helpTitle: 'Como puedo ayudar',
        smalltalk: 'Estoy aqui. Puedo conversar brevemente, pero mi funcion principal es ayudarle con la documentacion del curso.',
        identity: 'Soy Kika, un tutor especializado en la documentacion del curso. Puedo conversar brevemente, localizar, explicar, resumir y aclarar informacion de esa fuente, y solo uso busqueda en internet cuando web_search esta activado.',
        identityItems: ['Localizar informacion en la documentacion disponible.', 'Explicar, resumir y aclarar contenidos del curso sin inventar detalles no respaldados.', 'Usar internet solo cuando web_search esta activado.'],
        help: 'Puedo ayudarle a trabajar con la documentacion del curso y mantener conversacion breve sin inventar informacion no respaldada sobre el curso.',
        helpItems: ['Pregunte por un tema, modulo, apartado o pagina del curso.', 'Pida resumenes, explicaciones o listas estructuradas.', 'Pida comparar apartados cuando ambos esten en la documentacion.', 'Haga preguntas simples de conversacion o de uso.', 'Active web_search o escriba "Busca en internet" para complementar con fuentes externas.'],
        sourcesTitle: 'Fuentes de internet'
    },
    pt: {
        unavailableTitle: 'Informacao nao disponivel na documentacao',
        unavailableBody: 'Nao encontro na documentacao disponivel informacao suficiente para responder com seguranca a consulta:',
        unavailableHint: 'Pode reformular a pergunta indicando o tema, modulo, seccao ou pagina concreta que quer consultar.',
        externalTitle: 'Fora da documentacao disponivel',
        externalBody: 'Nao posso responder com conhecimento externo a menos que a pesquisa web esteja ativada. A consulta nao esta suportada pela documentacao do curso:',
        externalHint: 'Se quiser uma resposta baseada na internet, ative web_search ou inclua "Busca en internet" no pedido.',
        smalltalk: 'Estou aqui e pronto para ajudar com perguntas sobre a documentacao do curso.',
        identity: 'Sou um tutor especializado em responder a perguntas com base na documentacao do curso. Posso localizar, explicar e resumir informacao dessa fonte, e so uso pesquisa na internet quando estiver ativada.',
        help: 'Posso ajudar a localizar, explicar, resumir e estruturar informacao da documentacao do curso. Tambem pode pedir pesquisa web ativando web_search ou incluindo "Busca en internet" no pedido.',
        sourcesTitle: 'Fontes da internet'
    },
    fr: {
        unavailableTitle: 'Information non disponible dans la documentation',
        unavailableBody: 'Je ne trouve pas assez d information dans la documentation disponible pour repondre avec certitude a la requete :',
        unavailableHint: 'Vous pouvez reformuler la question en indiquant le theme, le module, la section ou la page precise a consulter.',
        externalTitle: 'Hors de la documentation disponible',
        externalBody: 'Je ne peux pas repondre avec des connaissances externes sauf si la recherche web est activee. La requete n est pas etayee par la documentation du cours :',
        externalHint: 'Si vous voulez une reponse fondee sur internet, activez web_search ou incluez "Busca en internet" dans la demande.',
        smalltalk: 'Je suis pret a vous aider avec des questions sur la documentation du cours.',
        identity: 'Je suis un tuteur specialise dans les reponses fondees sur la documentation du cours. Je peux localiser, expliquer et resumer les informations de cette source, et utiliser internet uniquement lorsque la recherche web est activee.',
        help: 'Je peux vous aider a trouver, expliquer, resumer et structurer les informations de la documentation du cours. Vous pouvez aussi demander une recherche web avec web_search ou "Busca en internet".',
        sourcesTitle: 'Sources internet'
    },
    ca: {
        unavailableTitle: 'Informacio no disponible en la documentacio',
        unavailableBody: 'No trobe en la documentacio disponible informacio suficient per a respondre amb seguretat a la consulta:',
        unavailableHint: 'Pot reformular la pregunta indicant el tema, modul, apartat o pagina concreta que vol consultar.',
        externalTitle: 'Fora de la documentacio disponible',
        externalBody: 'No puc respondre amb coneixement extern llevat que la cerca web estiga activada. La consulta no esta respaldada per la documentacio del curs:',
        externalHint: 'Si vol una resposta basada en internet, active web_search o incloga "Busca en internet" en la peticio.',
        smalltalk: 'Estic aci i preparat per a ajudar amb preguntes sobre la documentacio del curs.',
        identity: 'Soc un tutor especialitzat a respondre consultes basades en la documentacio del curs. Puc localitzar, explicar i resumir informacio d aquesta font, i nomes use internet quan la cerca web esta activada.',
        help: 'Puc ajudar a localitzar, explicar, resumir i estructurar informacio de la documentacio del curs. Tambe pot demanar cerca web activant web_search o incloent "Busca en internet".',
        sourcesTitle: 'Fonts d internet'
    },
    gl: {
        unavailableTitle: 'Informacion non disponibel na documentacion',
        unavailableBody: 'Non atopo na documentacion disponibel informacion suficiente para responder con seguridade a consulta:',
        unavailableHint: 'Pode reformular a pregunta indicando o tema, modulo, apartado ou paxina concreta que quere consultar.',
        externalTitle: 'Fora da documentacion disponibel',
        externalBody: 'Non podo responder con conecemento externo salvo que a busca web estea activada. A consulta non esta apoiada pola documentacion do curso:',
        externalHint: 'Se quere unha resposta baseada en internet, active web_search ou inclua "Busca en internet" na peticion.',
        smalltalk: 'Estou aqui e preparado para axudar con preguntas sobre a documentacion do curso.',
        identity: 'Son un titor especializado en responder consultas baseadas na documentacion do curso. Podo localizar, explicar e resumir informacion desa fonte, e so uso internet cando a busca web esta activada.',
        help: 'Podo axudar a localizar, explicar, resumir e estruturar informacion da documentacion do curso. Tamen pode pedir busca web activando web_search ou incluindo "Busca en internet".',
        sourcesTitle: 'Fontes de internet'
    },
    de: {
        unavailableTitle: 'Information in der Dokumentation nicht verfuegbar',
        unavailableBody: 'In der verfuegbaren Dokumentation finde ich nicht genug Informationen, um diese Anfrage sicher zu beantworten:',
        unavailableHint: 'Sie koennen die Frage mit Thema, Modul, Abschnitt oder konkreter Seite erneut formulieren.',
        externalTitle: 'Ausserhalb der verfuegbaren Dokumentation',
        externalBody: 'Ich kann nicht mit externem Wissen antworten, solange die Websuche nicht aktiviert ist. Die Anfrage wird nicht durch die Kursdokumentation gestuetzt:',
        externalHint: 'Wenn Sie eine internetgestuetzte Antwort moechten, aktivieren Sie web_search oder fuegen Sie "Busca en internet" hinzu.',
        smalltalk: 'Ich bin bereit, bei Fragen zur Kursdokumentation zu helfen.',
        identity: 'Ich bin ein Tutor, der auf Antworten anhand der Kursdokumentation spezialisiert ist. Ich kann Informationen aus dieser Quelle finden, erklaeren und zusammenfassen und nutze das Internet nur bei aktivierter Websuche.',
        help: 'Ich kann helfen, Informationen aus der Kursdokumentation zu finden, zu erklaeren, zusammenzufassen und zu strukturieren. Websuche ist mit web_search oder "Busca en internet" moeglich.',
        sourcesTitle: 'Internetquellen'
    },
    it: {
        unavailableTitle: 'Informazione non disponibile nella documentazione',
        unavailableBody: 'Non trovo nella documentazione disponibile informazioni sufficienti per rispondere con sicurezza alla richiesta:',
        unavailableHint: 'Puoi riformulare la domanda indicando tema, modulo, sezione o pagina concreta da consultare.',
        externalTitle: 'Fuori dalla documentazione disponibile',
        externalBody: 'Non posso rispondere con conoscenza esterna se la ricerca web non e attiva. La richiesta non e supportata dalla documentazione del corso:',
        externalHint: 'Se vuoi una risposta basata su internet, attiva web_search o includi "Busca en internet" nella richiesta.',
        smalltalk: 'Sono qui e pronto ad aiutarti con domande sulla documentazione del corso.',
        identity: 'Sono un tutor specializzato nel rispondere a domande basate sulla documentazione del corso. Posso trovare, spiegare e riassumere informazioni da quella fonte, e uso internet solo quando la ricerca web e attiva.',
        help: 'Posso aiutarti a trovare, spiegare, riassumere e strutturare informazioni dalla documentazione del corso. Puoi anche richiedere la ricerca web con web_search o "Busca en internet".',
        sourcesTitle: 'Fonti internet'
    }
};

export const getLocalizedCopy = (responseLanguage = LANGUAGE_PROFILES.es) => (
    localizedCopy[responseLanguage.localeHint] || localizedCopy.en
);
