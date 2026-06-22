import json
import os
from typing import List, Dict, Any, Optional

import numpy as np
from django.conf import settings

try:
    import faiss
    _HAS_FAISS = True
except Exception:
    _HAS_FAISS = False


class VectorStore:
    def __init__(self, index_dir: Optional[str] = None, dim: int = 384):
        if index_dir is None:
            index_dir = os.path.join(settings.BASE_DIR, 'rag_model', 'data')
        self.index_dir = index_dir
        os.makedirs(self.index_dir, exist_ok=True)
        self.index_path = os.path.join(self.index_dir, 'faiss.index')
        self.meta_path = os.path.join(self.index_dir, 'meta.json')
        self.dim = dim
        self._metadatas: List[Dict[str, Any]] = []
        self._index = None
        if _HAS_FAISS and os.path.exists(self.index_path):
            try:
                self._index = faiss.read_index(self.index_path)
                with open(self.meta_path, 'r', encoding='utf-8') as fh:
                    self._metadatas = json.load(fh)
            except Exception:
                self._index = None

    def _ensure_index(self, dim: int):
        if self._index is None:
            if _HAS_FAISS:
                self._index = faiss.IndexFlatIP(dim)
            else:
                # fallback: store embeddings in a numpy array
                self._index = []

    def add_documents(self, embeddings: List[List[float]], metadatas: List[Dict[str, Any]]):
        if not embeddings:
            return
        arr = np.array(embeddings, dtype=np.float32)
        # ensure unit normalization
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        arr = arr / norms
        dim = arr.shape[1]
        self._ensure_index(dim)

        if _HAS_FAISS and isinstance(self._index, faiss.IndexFlatIP):
            self._index.add(arr)
        else:
            # append to list fallback
            self._index.extend(arr.tolist())

        # append metadata
        self._metadatas.extend(metadatas)
        # save metadata and index
        try:
            if _HAS_FAISS and isinstance(self._index, faiss.IndexFlatIP):
                faiss.write_index(self._index, self.index_path)
            with open(self.meta_path, 'w', encoding='utf-8') as fh:
                json.dump(self._metadatas, fh)
        except Exception:
            pass

    def search(self, query_emb: List[float], top_k: int = 5) -> List[Dict[str, Any]]:
        if query_emb is None:
            return []
        q = np.array(query_emb, dtype=np.float32)
        q = q / (np.linalg.norm(q) + 1e-10)
        results = []
        if _HAS_FAISS and isinstance(self._index, faiss.IndexFlatIP):
            D, I = self._index.search(q.reshape(1, -1), top_k)
            for score, idx in zip(D[0], I[0]):
                if idx < 0 or idx >= len(self._metadatas):
                    continue
                results.append({'score': float(score), 'meta': self._metadatas[idx]})
        else:
            # brute force
            if not self._index:
                return []
            arr = np.array(self._index, dtype=np.float32)
            sims = arr.dot(q)
            best = np.argsort(-sims)[:top_k]
            for idx in best:
                results.append({'score': float(sims[idx]), 'meta': self._metadatas[idx]})
        return results

    def clear(self):
        self._index = None
        self._metadatas = []
        try:
            if os.path.exists(self.index_path):
                os.remove(self.index_path)
            if os.path.exists(self.meta_path):
                os.remove(self.meta_path)
        except Exception:
            pass
