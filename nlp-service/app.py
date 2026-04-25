from flask import Flask, request, jsonify  # type: ignore[import]
from flask_cors import CORS  # type: ignore[import]
import spacy  # type: ignore[import]

app = Flask(__name__)
CORS(app)

nlp = spacy.load("en_core_web_sm")

@app.route("/")
def home():
    return "UMUSU RMS NLP Service is running"

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.json
    text = data.get("text", "")

    doc = nlp(text)
    keywords = [token.text for token in doc if token.pos_ in ["NOUN", "PROPN"]]

    return jsonify({
        "summary": text[:120],
        "keywords": keywords,
        "category": "Pending classification"
    })

if __name__ == "__main__":
    app.run(port=8000, debug=True)