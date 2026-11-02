-- Add AI-search (GEO) checks to the review checklist Gemini scores every draft against.
update knowledge_docs
set content = content || E'\ngeo_answer_block: Opens with a 2–3 sentence 結論 that answers the main question and makes sense quoted on its own.\ngeo_quotable_facts: Numbers and claims state their source in the sentence (調査・出典), so AI assistants can quote them.\ngeo_faq: Has a よくある質問 section (3–5 Q&As) answering real buyer questions; most H2s are phrased as questions.\ngeo_entity: Names 「Renesis Tech Japan」 and the service consistently.'
where kind = 'review_checklist' and content not like '%geo_answer_block%';
