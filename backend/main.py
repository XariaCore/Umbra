import logging
import os

import requests
from agents.orchestrator import build_workflow
from core.graph import CodeGraph
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return (
            record.getMessage().find("/health") == -1
            and record.getMessage().find("/analyze") == -1
        )

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

graph_engine = CodeGraph()
workflow = build_workflow()

current_dir = os.path.dirname(os.path.abspath(__file__))

CODEBASE_ROOT = os.path.abspath(os.path.join(current_dir, "../codebase"))
LLM_SERVER_URL = "http://localhost:8080/health"


class ChatRequest(BaseModel):
    message: str


@app.get("/health")
def health_check():
    llm_status = "disconnected"
    try:
        response = requests.get(LLM_SERVER_URL, timeout=0.5)
        if response.status_code == 200:
            llm_status = "connected"
    except Exception:
        llm_status = "disconnected"

    return {"status": "active", "system": "Umbra Core", "llm": llm_status}


@app.get("/analyze")
def analyze():
    if os.path.exists(CODEBASE_ROOT):
        graph_engine.build_graph(CODEBASE_ROOT)
    return graph_engine.get_frontend_data()


@app.get("/read-file")
def read_file(path: str):
    target_path = os.path.join(CODEBASE_ROOT, path)
    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.")
    try:
        with open(target_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"path": path, "content": content}
    except Exception as e:
        return {"error": str(e)}


@app.post("/chat")
def chat(req: ChatRequest):
    print(f"\n💬 [USER]: {req.message}")
    try:
        result = workflow.invoke({"request": req.message})

        output_text = result.get("output", "")
        code_text = result.get("code", "")
        agent_name = result.get("agent_name", "Sistem")

        return {
            "plan": output_text,
            "code": code_text,
            "role": agent_name,
        }
    except Exception as e:
        print(f"❌ Chat Error: {e}")
        return {"plan": "Hata oluştu.", "code": str(e)}
