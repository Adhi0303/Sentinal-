"""
rag_pipeline.py — Sentinel RAG Pipeline (LangChain + HuggingFace + Pinecone)

This module handles the full RAG lifecycle:
  1. Embedding: Converts text chunks into 384-dimensional vectors using HuggingFace
  2. Storage: Upserts vectors into Pinecone Vector Database
  3. Retrieval: Semantic similarity search to find relevant policy chunks
"""
import os
from dotenv import load_dotenv

from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec

# Load credentials from agents-fleet/.env
env_path = os.path.join(os.path.dirname(__file__), '..', 'agents-fleet', '.env')
load_dotenv(env_path)

PINECONE_API_KEY   = os.environ.get("PINECONE_API_KEY")
PINECONE_INDEX     = os.environ.get("PINECONE_INDEX_NAME", "sentinel-rag")
# all-MiniLM-L6-v2 produces 384-dimensional vectors — free, runs locally
EMBEDDING_MODEL    = "all-MiniLM-L6-v2"
EMBEDDING_DIM      = 384

# ── Shared embedding model (loaded once, reused everywhere) ──────────────────
embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)


def _get_pinecone_index():
    """Ensures the Pinecone index exists, creating it if necessary."""
    pc = Pinecone(api_key=PINECONE_API_KEY)
    existing = [idx.name for idx in pc.list_indexes()]
    if PINECONE_INDEX not in existing:
        print(f"[RAG PIPELINE] Creating Pinecone index '{PINECONE_INDEX}'...")
        pc.create_index(
            name=PINECONE_INDEX,
            dimension=EMBEDDING_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        print(f"[RAG PIPELINE] Index '{PINECONE_INDEX}' created successfully.")
    return pc.Index(PINECONE_INDEX)


def ingest_document(file_path: str, doc_id_prefix: str, namespace: str = "trusted") -> list[str]:
    """
    Loads a text document, splits it into chunks, embeds each chunk,
    and upserts them into Pinecone.

    Args:
        file_path: Absolute path to the .txt policy document.
        doc_id_prefix: Prefix for the document ID (e.g., 'doc_fee_policy_01').
        namespace: Pinecone namespace. Use 'trusted' for real docs, 
                   'poisoned' for attack simulations.

    Returns:
        List of chunk texts (so caller can register their hashes in Redis).
    """
    _get_pinecone_index()   # Ensure index exists

    # 1. Load document
    loader = TextLoader(file_path, encoding="utf-8")
    docs = loader.load()
    print(f"[RAG PIPELINE] Loaded document: {os.path.basename(file_path)}")

    # 2. Split into chunks (each rule becomes its own chunk)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=300,
        chunk_overlap=50,
        separators=["\n\n", "\n", ". "],
    )
    chunks = splitter.split_documents(docs)
    print(f"[RAG PIPELINE] Split into {len(chunks)} chunks.")

    # Attach the exact doc_id to the metadata of each chunk so we can verify it later
    for i, chunk in enumerate(chunks):
        chunk.metadata["doc_id"] = f"{doc_id_prefix}_chunk_{i}"

    # 3. Embed + upsert into Pinecone
    PineconeVectorStore.from_documents(
        documents=chunks,
        embedding=embeddings,
        index_name=PINECONE_INDEX,
        namespace=namespace,
    )
    print(f"[RAG PIPELINE] Upserted {len(chunks)} chunks to Pinecone namespace='{namespace}'.")

    return [c.page_content for c in chunks]


def get_retriever(namespace: str = "trusted", top_k: int = 3):
    """
    Returns a LangChain Retriever backed by Pinecone.
    Call retriever.invoke("user question") to get the most relevant chunks.

    Args:
        namespace: 'trusted' for legitimate docs, 'poisoned' for attack tests.
        top_k: Number of relevant chunks to return.
    """
    vector_store = PineconeVectorStore(
        index_name=PINECONE_INDEX,
        embedding=embeddings,
        namespace=namespace,
    )
    return vector_store.as_retriever(search_kwargs={"k": top_k})
