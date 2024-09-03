# Auto-instrumenting your Node.js deployments

This walkthrough will aim to provide a way to reliably install and deploy an [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) on an existing Node.js application without the need of modifying its source code. Traces scraped by the Collector may be exported to different backends of the cluster-admin's choice.

These backends are, but not limited to:

- [**Jaeger**](https://www.jaegertracing.io/) - [Deployment guide](#jaeger)
- [**Prometheus**](https://prometheus.io/) - [Deployment guide](#prometheus)
- [**Kibana**](https://www.elastic.co/kibana)

# OpenTelemetry

[OpenTelemetry](https://opentelemetry.io/) is an Observability(Add note) framework. It is designed to create, manage, and distribute telemetry data such as traces(Add note), metrics(Add note), and logs(Add note). It is **not** an observability backend. Its main goal is to distribute signals and instrument applications in your application or system.

## OpenTelemetry Collector

The OpenTelemetry Collector offers a vendor-agnostic agent that receives, processes, and exports telemetry data from multiple, different sources to their respective backends. It ensures having to run the least amount of agents and/or collectors possible from their respective vendors by funneling all data into one same collector.

![](https://opentelemetry.io/docs/collector/img/otel-collector.svg)

## Deployment

**DISCLAIMER:** This example deploys a Collector for a testing and developing environment. In a production environment, the Collector should be deployed and configured as a [DaemonSet](https://opentelemetry.io/docs/kubernetes/getting-started/#daemonset-collector) as explained in the docs.

Assuming [Helm](https://helm.sh/docs/intro/install/) is already installed in your current deployment, download and install the `cert-manager` dependencies:

```bash
$ helm repo add jetstack https://charts.jetstack.io --force-update
```

Next, install it into your cluster:

```bash
$ helm install \
    cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --create-namespace \
    --version v1.15.3 \
    --set crds.enabled=true
```

Optionally, to verify whether the installation was successful, please refer to the [official `cert-manager` documentation](https://cert-manager.io/docs/installation/kubectl/#verify).

Next, we'll be able to deploy the Collector into an existing cluster with the following command:

```bash
$ kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml
```

Once the CRD is applied in the cluster, you'll be able to configure the collector and its instrumentation resources to the needs of your application.

## Configuration

### OpenTelemetryCollector

This resource defines how the Collector should behave. It does this by offering multiple configurations for its [Receivers](#receivers), [Processors](#processors), [Exporters](#exporters), and [Pipelines](#pipelines). Processors are optional, as a Pipeline can be comprised of just a Receiver and an Exporter. By default, the `-collector` suffix will be added to the services generated by this deployment.

```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: OpenTelemetryCollector
metadata:
  name: demo
spec:
  config: |
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318

    processors:
      memory_limiter:
        check_interval: 1s
        limit_percentage: 75
        spike_limit_percentage: 15
      batch:
        send_batch_size: 10000
        timeout: 10s

    exporters:
        otlp/jaeger:
        endpoint: simplest-collector:4317
        tls:
          insecure: true
      prometheus/prom:
        endpoint: '0.0.0.0:9090'

    service:
      telemetry:
        metrics:
          address: 0.0.0.0:8888
      pipelines:
        traces:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [otlp/jaeger]
        metrics:
          receivers: [otlp]
          processors: [memory_limiter, batch]
          exporters: [prometheus/prom]
```

### Instrumentation

An Instrumentation resource defines how the auto-instrumentation of an application should be carried out. By default, an empty instrumentation resource will instrument **ALL** possible telemetry data for most [supported languages](https://opentelemetry.io/docs/zero-code/).

```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: Instrumentation
metadata:
  name: demo-instrumentation
  namespace: node-app
spec:
  nodejs:
    image: ghcr.io/open-telemetry/opentelemetry-operator/autoinstrumentation-nodejs:latest
  exporter:
    endpoint: http://demo-collector.default.svc.cluster.local:4317
  propagators:
    - tracecontext
    - baggage
  sampler:
    type: parentbased_traceidratio
    argument: "1"
```

### Choosing which deployments to auto-instrument

For an application to be auto-instrumented, the operator needs to inject its agents into its containers. To do this, we must modify the main `Deployment` of the application as add the injection labels for our language of choice under `spec.template.metadata.annotations`.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: node-mainapp
  namespace: node-app
  labels:
    app: nodeapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nodeapp
  template:
    metadata:
      labels:
        app: nodeapp
      annotations: # The following annotations must be added
        sidecar.opentelemetry.io/inject: "true"
        instrumentation.opentelemetry.io/inject-nodejs: "true"
    spec:
      containers:
        - name: node-app
          image: mchecah/node-app:latest
          ports:
            - containerPort: 3000
        - name: node-app-login
          image: mchecah/node-app-login:latest
          ports:
            - containerPort: 3001
```

# Jaeger

[Jaeger](https://www.jaegertracing.io/) is an open-source distributed tracing platform. It allows to monitor and troubleshoot distributed workflows, identify performance bottlenecks, analyze service dependencies, and easily spot issues in a distributed network from their very root.

## Deployment

To install the operator, run:

```bash
$ kubectl create namespace observability
$ kubectl create -f https://github.com/jaegertracing/jaeger-operator/releases/download/v1.60.0/jaeger-operator.yaml -n observability
```

By default, the installation is done in cluster wide mode. To only watch specific namespaces, the `ClusterRole` and `ClusterRoleBinding` of the manifest must be changed to `Role` and `RoleBinding`. The `WATCH_NAMESPACE` environment variable must also be set on the jaeger operator Deployment.

A [Production installation](https://www.jaegertracing.io/docs/1.60/operator/#production-strategy) can be found in the official docs. For testing purposes, the [All-in-one](https://www.jaegertracing.io/docs/1.60/operator/#quick-start---deploying-the-allinone-image) image should be used, which can be deployed with the following resource:

```yaml
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata:
  name: simplest
```

And subsequently applied:

```bash
$ kubectl apply -f simplest.yaml
```

## Configuration

To configure the different resources, please refer to the [official documentation](https://www.jaegertracing.io/docs/1.60/operator/#configuring-the-custom-resource). This test uses all of the default settings from the All-in-one installation.

# Prometheus

[Prometheus](https://prometheus.io/) is an open-source observability backend especialized in scraping and monitoring metrics, as well as an alerting toolkit. It collects and stores metrics as sets of key-value pairs with timestamps from the time they were captures.

## Deployment

To begin with, we'll create a new namespace where our Prometheus instance will run in:

```bash
$ kubectl create ns prometheus
```

With the namespace created, you can deploy the operator in your cluster via a Deployment. The permissions of which can be configured via a ClusterRole for security purposes.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: prometheus
  labels:
    app: prometheus-k8s
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus-k8s
  template:
    metadata:
      labels:
        app: prometheus-k8s
    spec:
      containers:
        - name: prometheus
          image: quay.io/prometheus/prometheus
          imagePullPolicy: IfNotPresent
          args:
            - "--storage.tsdb.retention.time=24h"
            - "--config.file=/etc/prometheus/prometheus.yml"
            - "--storage.tsdb.path=/prometheus/"
          ports:
            - containerPort: 9090
          resources:
            requests:
              cpu: 500m
              memory: 500M
            limits:
              cpu: 1
              memory: 1Gi
          volumeMounts:
            - name: prometheus-config-volume
              mountPath: /etc/prometheus/
            - name: prometheus-storage-volume
              mountPath: /prometheus/
      volumes:
        - name: prometheus-config-volume
          configMap:
            defaultMode: 420
            name: prometheus-config
  
        - name: prometheus-storage-volume
          emptyDir: {}
```

## Configuration

### Job configuration

By default, the Prometheus operator will **not** start scraping metrics until we specify which jobs it needs to take care of. You need to explicitly state which endpoint it wants to scrape, as well as configure the job. The operator can handle multiple incoming jobs, as well as setting both global and job-scoped configurations.

For this simple demostration, we'll create a new job in the Deployment's volumes to start actively scraping its given endpoint:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  labels:
    name: prometheus-k8s-conf
  namespace: prometheus
data:
  prometheus.yml: |-
    global:
      scrape_interval: 10s
    scrape_configs:
    - job_name: 'sample-job'
      static_configs:
      - targets: ['demo-collector.default.svc.cluster.local:9090']
```

### Exposing the GUI Service

To access Prometheus' built in graphical user interface, we'll have to expose it via a service. This will let you observe and manage all of the metrics that Prometheus scrapes, as well as querying the results with [PromQL](https://prometheus.io/docs/prometheus/latest/querying/basics/) — a built-in querying language to filter and visualize metrics.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: prometheus-service
  namespace: prometheus
  annotations:
      prometheus.io/scrape: 'true'
      prometheus.io/port:   '9090'
spec:
  type: NodePort
  ports:
    - port: 9090
      targetPort: 9090 
```

### Scraping Service

We now have to deploy the Service in charge of routing the metrics from our OpenTelemetry Collector exporter to Prometheus. Once the link is established, Prometheus will start actively scraping for metrics following the parameters and configuration specified on its job.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: prometheus-service-scrape
  namespace: prometheus
spec:
  ports:
  - name: otlp-grpc
    port: 4317
    protocol: TCP
    targetPort: 4317
  - name: metrics
    port: 9090
    protocol: TCP
    targetPort: 9090
  selector:
    app.kubernetes.io/name: opentelemetrycollector
  type: ClusterIP
```

It is important to set the selector so the Service properly binds with our deployment. Otherwise the endpoints will become unreacheable.

# Kibana

[Kibana](https://www.elastic.co/kibana) offers visualization, management, and monitoring solutions for your application. It is deeply integrated with the Elastic Stack, provided by [Elasticsearch](https://www.elastic.co/elasticsearch). It is a proprietary solution for applications reliant on being provided with Elasticsearch data.

Because of how deeply integrated it is with the Elastic Stack, a full deployment of the Elastic Cloud on Kubernetes (ECK) is needed. If your application already has an Operator and an Elasticsearch instance running, please go to [Deploying Kibana](#deploying-kibana).

## Deployment

### Deploying the ECK Operator

To begin with, you must install the full set of Custom Resource Definitions (CRD) provided by Elastic:

```bash
$ kubectl create -f https://download.elastic.co/downloads/eck/2.14.0/crds.yaml
```

Once the CRDs have been created, we can then deploy the Operator, including its RBAC rules:

```bash
$ kubectl apply -f https://download.elastic.co/downloads/eck/2.14.0/operator.yaml
```

### Deploying an Elasticsearch node

*See also; [Manage compute resources](https://www.elastic.co/guide/en/cloud-on-k8s/current/k8s-managing-compute-resources.html)*

**NOTE:** [By default](https://www.elastic.co/guide/en/cloud-on-k8s/current/k8s-managing-compute-resources.html#k8s-default-behavior), an Elasticsearch node requires a node with at least 2 GiB of free memory. This will be configured in the example below, but if the node cannot provide the memory, the Pod will be stuck in a Pending state.

Next, you'll need to deploy an Elasticsearch node. This will be the database and data provider that Kibana will consume from.

```yaml
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: quickstart
spec:
  version: 8.15.0
  nodeSets:
  - name: default
    count: 1
    config:
      node.store.allow_mmap: false
    podTemplate:
      spec:
        containers:
        - name: elasticsearch
          resources:
            requests:
              memory: 512Mi
              cpu: 2
            limits:
              memory: 512Mi
```

By default, an user named `elastic` will store the password to the service in a secret. To request access to the node, we must first get the credentials.

```bash
$ PASSWORD=$(kubectl get secret quickstart-es-elastic-user -o go-template='{{.data.elastic | base64decode}}')
```

### Deploying Kibana

## Configuration

# Information and documentation

- [OpenTelemetry k8s docs](https://opentelemetry.io/docs/kubernetes/)
- [OpenTelemetry Operator API](https://github.com/open-telemetry/opentelemetry-operator/blob/main/docs/api.md)
- [Jaeger k8s docs](https://www.jaegertracing.io/docs/1.60/deployment/)
- [Deployment of an OpenTelemetry Collector with Prometheus support](https://medium.com/@tathagatapaul7/opentelemetry-in-kubernetes-deploying-your-collector-and-metrics-backend-b8ec86ac4a43)
- [Elastic Stack k8s docs](https://www.elastic.co/guide/en/cloud-on-k8s/current/k8s-quickstart.html)