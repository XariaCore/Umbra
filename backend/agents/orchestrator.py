import os
import re
import sys
from typing import Literal, TypedDict

from core.llm import get_llm
from langgraph.graph import END, StateGraph

class AgentState(TypedDict):
    request: str  # Kullanıcı isteği
    context: str  # Dosya içeriği
    output: str  # Sage veya Architect metin çıktısı
    code: str  # Engineer kod çıktısı
    agent_name: str  # Cevap veren ajanın ismi (Sage/Architect)

llm = get_llm()

current_dir = os.path.dirname(os.path.abspath(__file__))
CODEBASE_ROOT = os.path.abspath(os.path.join(current_dir, "../../codebase"))

def get_project_structure(root_path):
    if not os.path.exists(root_path):
        return "⚠️ Codebase folder not found."

    structure = "📂 PROJECT STRUCTURE:\n"
    ignore = {
        ".git",
        "__pycache__",
        ".venv",
        "venv",
        ".idea",
        "node_modules",
        ".cache",
        "dist",
        "build",
        ".DS_Store",
    }

    for root, dirs, files in os.walk(root_path):
        dirs[:] = [d for d in dirs if d not in ignore]
        level = root.replace(root_path, "").count(os.sep)
        indent = " " * 4 * level
        folder = os.path.basename(root)

        if folder:
            structure += f"{indent}📁 {folder}/\n"

        for f in files:
            if f.endswith(".py") or f.endswith(".md") or f.endswith(".json"):
                structure += f"{indent}    📄 {f}\n"

    return structure


def find_file_recursive(filename, search_root):
    for root, dirs, files in os.walk(search_root):
        if filename in files:
            return os.path.join(root, filename)
    return None


def get_file_context(user_req):
    match = re.search(r"\b([a-zA-Z0-9_\-]+\.py)\b", user_req)

    if match:
        filename = match.group(1)
        print(f"   🔍 [SYSTEM] Searching for '{filename}'...")
        found_path = find_file_recursive(filename, CODEBASE_ROOT)

        if found_path:
            try:
                with open(found_path, "r", encoding="utf-8") as f:
                    return (
                        f"--- CONTENT OF {filename} ---\n"
                        f"{f.read()}\n"
                        f"--- END OF FILE ---"
                    )
            except Exception as e:
                return f"ERROR: Could not read file ({e})"

    return ""

def router_node(state: AgentState) -> Literal["sage", "architect"]:
    print(f'\n🚦 [ROUTER] Analyzing request: "{state["request"]}"')

    # Prompt Türkçe niyet analizi için ayarlandı
    prompt = f"""Kullanıcının isteğini analiz et ve uygun ajanı seç.

İSTEK: "{state["request"]}"

SEÇENEKLER:
- SAGE: Genel sohbet, proje hakkında sorular, selamlaşma, "Bu dosya ne işe yarar?", "Projenin amacı ne?"
- ARCHITECT: Kod yazma, hata düzeltme, yeni dosya oluşturma, refactoring, test yazma istekleri.

Sadece tek bir kelime cevap ver: SAGE veya ARCHITECT.
"""

    response = ""
    for chunk in llm.stream(prompt):
        response += chunk.content

    decision = response.strip().upper()

    if "ARCHITECT" in decision or "MIMAR" in decision or "KOD" in decision:
        print("   👉 Decision: ARCHITECT (Technical Task)")
        return "architect"
    else:
        print("   👉 Decision: SAGE (Chat/Info)")
        return "sage"

def sage_node(state: AgentState):
    print("\n📚 [SAGE] Consulting knowledge base...")

    structure = get_project_structure(CODEBASE_ROOT)
    file_ctx = get_file_context(state["request"])

    prompt = f"""Sen UMBRA'Bilge'sisin (The Sage).

Görevin: Kullanıcıyla TÜRKÇE sohbet etmek, proje yapısı hakkında bilgi vermek ve teknik olmayan soruları yanıtlamaktır.
ASLA kod yazma. Eğer kod yazılması gerekiyorsa, nazikçe bunu Mimar'ın yapabileceğini söyle.

MEVCUT PROJE YAPISI:
{structure}

DOSYA BAĞLAMI (Varsa):
{file_ctx}

KULLANICI: {state["request"]}

Samimi, net ve yardımsever bir dille TÜRKÇE cevap ver. Markdown formatını kullan.
"""

    response = ""
    for chunk in llm.stream(prompt):
        response += chunk.content
        sys.stdout.write(chunk.content)
        sys.stdout.flush()

    return {"output": response, "agent_name": "Sage", "code": ""}

def architect_node(state: AgentState):
    print("\n📐 [ARCHITECT] Designing technical plan...")

    structure = get_project_structure(CODEBASE_ROOT)
    file_ctx = get_file_context(state["request"])

    prompt = f"""Sen UMBRA Mimarı'sın.

Görevin: Kullanıcının teknik isteğini (kodlama, refactor, debug) analiz edip Mühendis için adım adım bir uygulama planı çıkarmaktır.

PROJE YAPISI:
{structure}

DOSYA İÇERİĞİ:
{file_ctx}

İSTEK: {state["request"]}

KURALLAR:
1. Python kodu yazma. Sadece yapılacakları maddeler halinde (1., 2., 3.) TÜRKÇE olarak planla.
2. Hangi dosyaların değişeceğini veya oluşturulacağını belirt.
3. Mühendis'e net talimatlar ver.
"""

    response = ""
    for chunk in llm.stream(prompt):
        response += chunk.content
        sys.stdout.write(chunk.content)
        sys.stdout.flush()

    return {
        "output": response,
        "context": file_ctx,
        "agent_name": "Architect",
    }

def engineer_node(state: AgentState):
    print("\n\n🛠️ [ENGINEER] Coding started...")

    prompt = f"""Sen Uzman bir Python Geliştiricisisin.
Mimar'ın planını koda dök.

MİMARIN PLANI (TÜRKÇE):
{state["output"]}

MEVCUT KOD BAĞLAMI:
{state.get("context", "")}

KURALLAR:
1. Sadece Python kodu yaz.
2. Kodunu ```python bloğu içine al.
3. Açıklama metni yazma, sadece kod.
"""

    full_code = ""
    for chunk in llm.stream(prompt):
        full_code += chunk.content
        sys.stdout.write(chunk.content)
        sys.stdout.flush()

    return {"code": full_code}

def build_workflow():
    workflow = StateGraph(AgentState)

    workflow.add_node("sage", sage_node)
    workflow.add_node("architect", architect_node)
    workflow.add_node("engineer", engineer_node)

    workflow.set_conditional_entry_point(
        router_node,
        {"sage": "sage", "architect": "architect"},
    )

    workflow.add_edge("sage", END)
    workflow.add_edge("architect", "engineer")
    workflow.add_edge("engineer", END)

    return workflow.compile()
