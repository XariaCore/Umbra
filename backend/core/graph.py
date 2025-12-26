import os
import networkx as nx
from core.parser import analyze_file_structure

class CodeGraph:
    def __init__(self):
        self.graph = nx.DiGraph()

    def build_graph(self, root_dir):
        self.graph.clear()

        if not os.path.exists(root_dir):
            return

        IGNORED = {".git", "__pycache__", "venv", "env", "node_modules", ".idea"}

        for root, dirs, files in os.walk(root_dir):
            dirs[:] = [d for d in dirs if d not in IGNORED]

            for file in files:
                if file.endswith(".py"):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, root_dir)

                    self.graph.add_node(rel_path, label=file, type="file")

                    structure = analyze_file_structure(full_path)

                    for func in structure["functions"]:
                        func_id = f"{rel_path}::{func['name']}"
                        self.graph.add_node(
                            func_id,
                            label=func["name"],
                            type="function",
                            parent=rel_path,
                            args=func["args"],
                        )

                        self.graph.add_edge(rel_path, func_id, type="contains")

                    for cls in structure["classes"]:
                        cls_id = f"{rel_path}::{cls['name']}"
                        self.graph.add_node(
                            cls_id, label=cls["name"], type="class", parent=rel_path
                        )
                        self.graph.add_edge(rel_path, cls_id, type="contains")

                    for call in structure["calls"]:
                        target_func = call["to"]
                        source_scope = call["from"]

                        if source_scope == "global":
                            source_id = rel_path
                        else:
                            source_id = f"{rel_path}::{source_scope}"

                        for node in self.graph.nodes():
                            if node.endswith(f"::{target_func}"):
                                self.graph.add_edge(source_id, node, type="calls")

    def get_frontend_data(self):
        nodes = []
        edges = []

        for node, data in self.graph.nodes(data=True):
            node_data = {
                "id": node,
                "type": data.get("type", "default"),
                "data": {
                    "label": data.get("label", node),
                    "args": data.get("args", []),
                    "returns": data.get("returns", ""),  # YENİ ALAN
                },
                "parentNode": data.get("parent", None),
                "extent": "parent" if data.get("parent") else None,
            }
            nodes.append(node_data)

        for u, v, data in self.graph.edges(data=True):
            if data.get("type") == "contains":
                continue

            edges.append(
                {
                    "id": f"{u}-{v}",
                    "source": u,
                    "target": v,
                    "animated": True,
                    "type": "smoothstep",
                    "label": "calls" if data.get("type") == "calls" else "",
                }
            )

        return {"nodes": nodes, "edges": edges}
