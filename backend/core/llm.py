from langchain_openai import ChatOpenAI


def get_llm():
    """
    Llama.cpp sunucusuna bağlanır (Yerel Kurulum).
    """
    base_url = "http://127.0.0.1:8080/v1"

    return ChatOpenAI(
        base_url=base_url,
        api_key="sk-local-no-key",
        model="umbra-coder",
        temperature=0,
        streaming=True,
    )
