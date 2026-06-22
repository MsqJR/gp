import os
import re
from typing import List, Optional

from django.conf import settings

from rag_model.local_models import LocalModelClient
from rag_model.vector_store import VectorStore


def _token_set(text: str) -> set:
    tokens = re.findall(r"\w+", text.lower())
    return set(tokens)


class RAGService:
    def __init__(self, *, index_dir: Optional[str] = None):
        if index_dir is None:
            index_dir = os.path.join(settings.BASE_DIR, 'rag_model', 'data')
        self.lm = LocalModelClient()
        self.store = VectorStore(index_dir=index_dir)

    def ask(self, question: str, top_k: int = 6) -> dict:
        # embed query
        q_emb = self.lm.embed_texts([question])[0]
        results = self.store.search(q_emb, top_k=top_k)

        # dedupe near-duplicate chunks by exact text / token overlap
        seen_texts = set()
        candidates = []
        q_tokens = _token_set(question)
        for item in results:
            meta = item.get('meta') or {}
            text = meta.get('text', '')
            if not text:
                continue
            text_key = text.strip()[:200]
            if text_key in seen_texts:
                continue
            seen_texts.add(text_key)
            # compute keyword overlap score
            overlap = len(q_tokens & _token_set(text))
            # combine with embedding similarity (score is inner product on normalized vectors)
            sim = float(item.get('score') or 0.0)
            rank_score = sim + 0.03 * overlap
            candidates.append((rank_score, sim, overlap, text, meta))

        # sort and pick top 4
        candidates.sort(key=lambda x: x[0], reverse=True)
        top = candidates[:4]

        # assemble context with citations
        context_parts: List[str] = []
        sources = []
        for i, (_, sim, overlap, text, meta) in enumerate(top, start=1):
            citation = meta.get('source') or meta.get('meta', {}).get('url') or f'source:{i}'
            context_parts.append(f"[Source {i}: {citation}]\n{text}\n")
            sources.append({'source': citation, 'similarity': sim, 'overlap': overlap})

        context = '\n\n'.join(context_parts)

        # enforce context length protection
        max_context_chars = 4000
        if len(context) > max_context_chars:
            context = context[:max_context_chars]

        # build prompt for grounded generation
        system = (
            "You are a conservative, evidence-first medical assistant. "
            "Answer only from the provided context. If the answer is not explicitly supported, say 'I don't have enough information in the provided sources to answer that' and do not speculate. "
            "Cite sources inline as [Source N]. Keep answers concise and do not provide prescription dosing."
        )

        prompt = f"{system}\n\nCONTEXT:\n{context}\n\nQUESTION: {question}\n\nAnswer with a short evidence-based response and a final 'confidence' line." 

        generated = self.lm.generate(prompt, max_new_tokens=256)

        # derive a lightweight confidence score as mean of similarities
        if sources:
            mean_sim = sum([s['similarity'] for s in sources]) / len(sources)
            # normalize inner product (approx -1..1) to 0..1
            confidence = max(0.0, min(1.0, (mean_sim + 1.0) / 2.0))
        else:
            confidence = 0.0

        return {
            'answer': generated.strip() if generated else "I don't have enough information in the provided sources to answer that.",
            'sources': sources,
            'confidence': float(confidence),
            'raw_model_output': generated,
        }
