
# Connect the Flask backend to the SRTF web interface.

from flask import Flask, render_template, jsonify, request
from algorithm import load_jobs, simulate_srtf, validate_jobs

# Use the existing interface folder for HTML, CSS, and JavaScript.
app = Flask(
    __name__,
    template_folder="interface",
    static_folder="interface",
    static_url_path="/static"
)


@app.route("/")
def home():
    # Display interface/index.html
    return render_template("index.html")


@app.route("/api/sample-jobs", methods=["GET"])
def get_sample_jobs():
    try:
        jobs = load_jobs("samplejobs.csv")
        return jsonify({"jobs": jobs})

    except (ValueError, FileNotFoundError) as error:
        return jsonify({"error": str(error)}), 400


@app.route("/api/simulate", methods=["POST"])
def run_simulation():
    
    try:
        data = request.get_json(silent=True) or {}
        jobs = validate_jobs(data.get("jobs", []))

        if not jobs:
            return jsonify({"error": "Add at least one job."}), 400

        # Run the SRTF scheduling algorithm.
        result = simulate_srtf(jobs)

        return jsonify(result)

    except (ValueError, TypeError) as error:
        return jsonify({"error": str(error)}), 400


if __name__ == "__main__":
    app.run(debug=True)