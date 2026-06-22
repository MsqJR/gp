import json
import os
from typing import Optional

import requests
from django.conf import settings
from django.core.management.base import BaseCommand

from rag_model.vector_store import VectorStore
from rag_model.local_models import LocalModelClient

def chunk_text(text: str, chunk_size: int = 800) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end
    return chunks

class Command(BaseCommand):
    help = 'Ingest a text/JSONL file or fetch from OpenFDA API into the RAG FAISS vector store.'

    def add_arguments(self, parser):
        parser.add_argument('source', nargs='?', default=None, help='Path to a text file or JSONL with a "text" field. If omitted, data is fetched from OpenFDA API.')
        parser.add_argument('--index-dir', default=None, help='Directory to store index and metadata (defaults to rag_model/data/)')
        parser.add_argument('--limit', type=int, default=20, help='Number of records to fetch if fetching from API')

    def handle(self, *args, **options):
        src = options['source']
        index_dir: Optional[str] = options.get('index_dir')
        if index_dir is None:
            index_dir = os.path.join(settings.BASE_DIR, 'rag_model', 'data')
        limit = options['limit']
        os.makedirs(index_dir, exist_ok=True)

        lm = LocalModelClient()
        store = VectorStore(index_dir=index_dir)

        added = 0
        
        if src is None:
            self.stdout.write("No source file provided. Fetching directly from OpenFDA API...")
            try:
                # Fetch recent drug labels from OpenFDA API
                response = requests.get(f'https://api.fda.gov/drug/label.json?search=_exists_:indications_and_usage&limit={limit}')
                response.raise_for_status()
                data = response.json()
                
                for item in data.get('results', []):
                    # Try to extract useful information
                    brand_name = item.get('openfda', {}).get('brand_name', ['Unknown Drug'])[0]
                    indications = item.get('indications_and_usage', [''])[0]
                    warnings = item.get('warnings', [''])[0]
                    dosage = item.get('dosage_and_administration', [''])[0]
                    
                    text = f"Drug Name: {brand_name}\nIndications: {indications}\nWarnings: {warnings}\nDosage: {dosage}"
                    if not text.strip() or len(text) < 20:
                        continue
                        
                    chunks = chunk_text(text)
                    embeddings = lm.embed_texts(chunks)
                    metas = [{'source': 'OpenFDA API', 'meta': {'brand_name': brand_name}, 'text': c} for c in chunks]
                    store.add_documents(embeddings, metas)
                    added += len(chunks)
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error fetching from API: {str(e)}"))
                return
                
        elif src.endswith('.jsonl') or src.endswith('.ndjson'):
            with open(src, 'r', encoding='utf-8') as fh:
                for line in fh:
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    text = obj.get('text') or obj.get('description') or obj.get('body') or ''
                    if not text:
                        continue
                    chunks = chunk_text(text)
                    embeddings = lm.embed_texts(chunks)
                    metas = [{'source': src, 'meta': obj.get('meta', {}), 'text': c} for c in chunks]
                    store.add_documents(embeddings, metas)
                    added += len(chunks)
        else:
            with open(src, 'r', encoding='utf-8') as fh:
                text = fh.read()
            chunks = chunk_text(text)
            embeddings = lm.embed_texts(chunks)
            metas = [{'source': src, 'meta': {}, 'text': c} for c in chunks]
            store.add_documents(embeddings, metas)
            added = len(chunks)

        self.stdout.write(self.style.SUCCESS(f'Ingested {added} chunks into index at {index_dir}'))
