"use strict";

module.exports = {
  "zh-Hant": {
    title: "思考路線",
    scope: "依記錄順序分段。進度說明與摘要來自平台，工具摘錄來自已儲存的結果。事件先後僅代表順序。",
    coverage: (n, total) => `${total} 則回答中有 ${n} 則留下過程記錄。`,
    empty: "此匯出沒有可排列的進度說明、思考摘要或工具活動。可在原始對話中查看解法。",
    turns: "有過程記錄的回答", turn: "回合", prompt: "原始問題", starting: "先前活動",
    note: "進度說明", thought: "思考摘要", titleOnly: "僅標題", activity: "工具活動",
    earlier: (n) => `另有 ${n} 則摘要可在完整軌跡查看。`,
    tools: (calls, results) => `${calls} 次呼叫，${results} 筆結果`,
    excerpt: "結果摘錄", answer: "查看最終回答", trace: "查看完整軌跡"
  },
  ja: {
    title: "判断の流れ",
    scope: "記録順に整理しています。進捗と要約は元のサービス、ツールの抜粋は保存された結果に基づきます。時系列は前後関係を示します。",
    coverage: (n, total) => `${total} 件の回答のうち ${n} 件に過程の記録があります。`,
    empty: "このエクスポートには進捗、思考の要約、ツールの記録がありません。回答は元の会話で確認できます。",
    turns: "過程の記録がある回答", turn: "ターン", prompt: "元の質問", starting: "それ以前の記録",
    note: "進捗", thought: "思考の要約", titleOnly: "題名のみ", activity: "ツールの記録",
    earlier: (n) => `ほか ${n} 件の要約は完全な記録で確認できます。`,
    tools: (calls, results) => `呼び出し ${calls} 件、結果 ${results} 件`,
    excerpt: "結果の抜粋", answer: "最終回答を見る", trace: "完全な記録を見る"
  },
  ko: {
    title: "판단 과정",
    scope: "기록된 순서대로 정리했습니다. 진행 상황과 요약은 서비스에서, 도구 발췌는 저장된 결과에서 가져왔습니다. 순서는 시간상 앞뒤 관계를 나타냅니다.",
    coverage: (n, total) => `답변 ${total}개 중 ${n}개에 과정 기록이 있습니다.`,
    empty: "이 내보내기에는 진행 상황, 사고 요약, 도구 활동 기록이 없습니다. 원본 대화에서 답변을 확인할 수 있습니다.",
    turns: "과정 기록이 있는 답변", turn: "턴", prompt: "원래 질문", starting: "이전 활동",
    note: "진행 상황", thought: "사고 요약", titleOnly: "제목만", activity: "도구 활동",
    earlier: (n) => `나머지 요약 ${n}개는 전체 기록에서 볼 수 있습니다.`,
    tools: (calls, results) => `호출 ${calls}회, 결과 ${results}개`,
    excerpt: "결과 발췌", answer: "최종 답변 보기", trace: "전체 기록 보기"
  },
  es: {
    title: "Proceso de decisión",
    scope: "Los pasos siguen el orden registrado. Las notas y los resúmenes proceden del servicio, y los extractos, de los resultados guardados. El orden indica la secuencia.",
    coverage: (n, total) => `${n} de ${total} respuestas tienen un registro del proceso.`,
    empty: "Esta exportación carece de notas de progreso, resúmenes de razonamiento y actividad de herramientas. Las respuestas están en la conversación original.",
    turns: "Respuestas con un registro del proceso", turn: "Turno", prompt: "Petición original", starting: "Actividad previa",
    note: "Nota de progreso", thought: "Resumen del razonamiento", titleOnly: "solo título", activity: "Actividad de herramientas",
    earlier: (n) => `Hay ${n} resúmenes adicionales en el registro completo.`,
    tools: (calls, results) => `Llamadas: ${calls}. Resultados: ${results}.`,
    excerpt: "Extracto del resultado", answer: "Leer la respuesta final", trace: "Ver el registro completo"
  },
  fr: {
    title: "Processus de décision",
    scope: "Les étapes suivent l’ordre enregistré. Les notes et résumés viennent du service, et les extraits, des résultats sauvegardés. L’ordre indique la succession des événements.",
    coverage: (n, total) => `${n} réponses sur ${total} comportent des étapes enregistrées.`,
    empty: "Cet export ne contient aucune note de progression, aucun résumé du raisonnement ni aucune activité d’outil. La conversation contient les réponses originales.",
    turns: "Réponses avec des étapes enregistrées", turn: "Tour", prompt: "Demande d’origine", starting: "Activité précédente",
    note: "Note de progression", thought: "Résumé du raisonnement", titleOnly: "titre seul", activity: "Activité des outils",
    earlier: (n) => `Consultez la trace complète pour les ${n} autres résumés.`,
    tools: (calls, results) => `${calls} appel(s), ${results} résultat(s)`,
    excerpt: "Extrait du résultat", answer: "Lire la réponse finale", trace: "Ouvrir la trace complète"
  },
  de: {
    title: "Entscheidungsverlauf",
    scope: "Die Schritte folgen der aufgezeichneten Reihenfolge. Notizen und Zusammenfassungen stammen vom Dienst, Auszüge aus gespeicherten Werkzeugergebnissen. Die Reihenfolge zeigt den zeitlichen Ablauf.",
    coverage: (n, total) => `Für ${n} von ${total} Antworten wurden Schritte aufgezeichnet.`,
    empty: "Dieser Export enthält keine Fortschrittsnotizen, Zusammenfassungen des Vorgehens oder Werkzeugaktivitäten. Die Antworten stehen im Originalgespräch.",
    turns: "Antworten mit aufgezeichneten Schritten", turn: "Runde", prompt: "Ursprüngliche Anfrage", starting: "Vorherige Aktivitäten",
    note: "Fortschrittsnotiz", thought: "Zusammenfassung des Vorgehens", titleOnly: "nur Titel", activity: "Werkzeugaktivität",
    earlier: (n) => `Die vollständige Aufzeichnung enthält ${n} weitere Zusammenfassungen.`,
    tools: (calls, results) => `Aufrufe: ${calls}. Ergebnisse: ${results}.`,
    excerpt: "Ergebnisauszug", answer: "Endgültige Antwort lesen", trace: "Vollständige Aufzeichnung öffnen"
  },
  pt: {
    title: "Percurso de decisão",
    scope: "As etapas seguem a ordem registada. As notas e os resumos vêm do serviço, e os excertos, dos resultados guardados. A ordem indica a sequência.",
    coverage: (n, total) => `${n} de ${total} respostas têm um registo do processo.`,
    empty: "Esta exportação não contém notas de progresso, resumos de raciocínio ou atividade de ferramentas. As respostas estão na conversa original.",
    turns: "Respostas com registo do processo", turn: "Turno", prompt: "Pedido original", starting: "Atividade anterior",
    note: "Nota de progresso", thought: "Resumo do raciocínio", titleOnly: "apenas título", activity: "Atividade das ferramentas",
    earlier: (n) => `O registo completo contém mais ${n} resumos.`,
    tools: (calls, results) => `Chamadas: ${calls}. Resultados: ${results}.`,
    excerpt: "Excerto do resultado", answer: "Ler a resposta final", trace: "Abrir o registo completo"
  },
  ar: {
    title: "مسار اتخاذ القرار",
    scope: "تُعرض الخطوات بالترتيب المسجّل. الملاحظات والملخصات من الخدمة، والمقتطفات من نتائج الأدوات المحفوظة. يوضح الترتيب تسلسل الأحداث.",
    coverage: (n, total) => `توجد خطوات مسجّلة في ${n} من أصل ${total} إجابة.`,
    empty: "لا يتضمن هذا التصدير ملاحظات تقدم أو ملخصات استدلال أو نشاط أدوات. يمكن قراءة الإجابات في المحادثة الأصلية.",
    turns: "الإجابات التي تتضمن خطوات مسجّلة", turn: "الدور", prompt: "الطلب الأصلي", starting: "النشاط السابق",
    note: "ملاحظة التقدم", thought: "ملخص الاستدلال", titleOnly: "العنوان فقط", activity: "نشاط الأدوات",
    earlier: (n) => `يتضمن السجل الكامل ${n} ملخصات إضافية.`,
    tools: (calls, results) => `عمليات الاستدعاء: ${calls}، النتائج: ${results}`,
    excerpt: "مقتطف من النتيجة", answer: "قراءة الإجابة النهائية", trace: "فتح السجل الكامل"
  },
  hi: {
    title: "निर्णय की प्रक्रिया",
    scope: "चरण उसी क्रम में हैं जिसमें वे दर्ज हुए। प्रगति और सारांश सेवा से लिए गए हैं। टूल के अंश सहेजे गए नतीजों से हैं। क्रम घटनाओं की श्रृंखला दिखाता है।",
    coverage: (n, total) => `${total} में से ${n} जवाबों की प्रक्रिया दर्ज है।`,
    empty: "इस निर्यात में प्रगति विवरण, तर्क का सारांश या टूल गतिविधि दर्ज नहीं है। जवाब मूल बातचीत में हैं।",
    turns: "दर्ज प्रक्रिया वाले जवाब", turn: "क्रम", prompt: "मूल सवाल", starting: "पहले की गतिविधि",
    note: "प्रगति विवरण", thought: "तर्क का सारांश", titleOnly: "केवल शीर्षक", activity: "टूल गतिविधि",
    earlier: (n) => `पूरे रिकॉर्ड में ${n} और सारांश हैं।`,
    tools: (calls, results) => `कॉल: ${calls}, नतीजे: ${results}`,
    excerpt: "नतीजे का अंश", answer: "अंतिम जवाब पढ़ें", trace: "पूरा रिकॉर्ड खोलें"
  }
};
