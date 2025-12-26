import ast

class CodeParser(ast.NodeVisitor):
    def __init__(self):
        self.structure = {"functions": [], "classes": [], "calls": [], "imports": []}
        self.current_scope = None

    def get_annotation(self, annotation):
        """Type Hint'i string'e çevirir."""
        if annotation is None:
            return "Any"
        if isinstance(annotation, ast.Name):
            return annotation.id
        if isinstance(annotation, ast.Constant):
            return str(annotation.value)
        if isinstance(annotation, ast.Subscript):
            try:
                return ast.unparse(annotation)
            except:
                return "Complex"
        try:
            return ast.unparse(annotation)
        except:
            return "Any"

    def analyze_return(self, node):
        """
        Return satırını analiz edip hem TİPİ hem de DEĞİŞKEN ADINI bulur.
        Dönüş formatı: "degisken_adi (tip)"
        """
        return_info = []

        for child in ast.walk(node):
            if isinstance(child, ast.Return) and child.value is not None:
                var_name = "result"
                var_type = "Any"

                if isinstance(child.value, ast.Name):
                    var_name = child.value.id
                    var_type = (
                        "dynamic"
                    )

                elif isinstance(child.value, ast.Constant):
                    var_name = str(child.value.value)
                    var_type = type(child.value.value).__name__

                elif isinstance(child.value, ast.Call):
                    if isinstance(child.value.func, ast.Name):
                        var_name = f"{child.value.func.id}()"
                    else:
                        var_name = "call()"
                    var_type = "object"

                if node.returns:
                    var_type = self.get_annotation(node.returns)

                return_info.append(f"{var_name} ({var_type})")

        if not return_info:
            return "void"

        return " | ".join(sorted(list(set(return_info))))

    def visit_Import(self, node):
        for alias in node.names:
            self.structure["imports"].append(alias.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module:
            self.structure["imports"].append(node.module)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):

        args_list = []
        for arg in node.args.args:
            arg_name = arg.arg
            arg_type = "Any"
            if arg.annotation:
                arg_type = self.get_annotation(arg.annotation)

            args_list.append(f"{arg_name} ({arg_type})")

        return_display = self.analyze_return(node)

        func_info = {
            "name": node.name,
            "args": args_list,
            "returns": return_display,
            "scope": self.current_scope,
            "lineno": node.lineno,
        }
        self.structure["functions"].append(func_info)

        prev_scope = self.current_scope
        self.current_scope = node.name
        self.generic_visit(node)
        self.current_scope = prev_scope

    def visit_ClassDef(self, node):
        class_info = {"name": node.name, "lineno": node.lineno}
        self.structure["classes"].append(class_info)
        prev_scope = self.current_scope
        self.current_scope = node.name
        self.generic_visit(node)
        self.current_scope = prev_scope

    def visit_Call(self, node):
        try:
            if isinstance(node.func, ast.Name):
                self.structure["calls"].append(
                    {"from": self.current_scope or "global", "to": node.func.id}
                )
            elif isinstance(node.func, ast.Attribute):
                if hasattr(node.func.value, "id"):
                    self.structure["calls"].append(
                        {
                            "from": self.current_scope or "global",
                            "to": f"{node.func.value.id}.{node.func.attr}",
                        }
                    )
        except:
            pass
        self.generic_visit(node)


def analyze_file_structure(file_path):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            code = f.read()

        tree = ast.parse(code)
        parser = CodeParser()
        parser.visit(tree)
        return parser.structure

    except SyntaxError as e:
        print(f"❌ SYNTAX ERROR ({file_path}): Line {e.lineno}")
        return {
            "functions": [
                {
                    "name": "⚠️ SYNTAX ERROR",
                    "args": [f"Line {e.lineno} (Error)"],
                    "returns": "Invalid (Python)",
                    "scope": None,
                    "lineno": e.lineno,
                }
            ],
            "classes": [],
            "calls": [],
            "imports": [],
        }
    except Exception as e:
        return {"functions": [], "classes": [], "calls": [], "imports": []}
