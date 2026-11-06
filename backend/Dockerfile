FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY app/ /app/app/
COPY migrations/ /app/migrations/
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
ENV PORT=8080 \
    SERVICE_ROLE=api
EXPOSE 8080
CMD ["/app/start.sh"]
