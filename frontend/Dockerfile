FROM python:3.12-slim

WORKDIR /site

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ksh wget curl vim \
    && rm -rf /var/lib/apt/lists/*

COPY index.html /site/index.html

EXPOSE 80

CMD ["python", "-m", "http.server", "80", "--bind", "0.0.0.0", "--directory", "/site"]
