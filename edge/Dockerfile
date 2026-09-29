FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
# Replace onnxruntime-gpu with standard onnxruntime (for CPU docker), and add ultralytics/pyyaml
RUN sed -i 's/onnxruntime-gpu/onnxruntime/g' requirements.txt && \
    pip install --no-cache-dir -r requirements.txt ultralytics pyyaml

# Copy app files
COPY . .

# Download the AI models during the docker build process so it starts fast later
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"
RUN python -c "from insightface.app import FaceAnalysis; app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); app.prepare(ctx_id=-1, det_size=(640,640))"

# Run the edge node
CMD ["python", "main.py", "--config", "config.docker.yaml"]
