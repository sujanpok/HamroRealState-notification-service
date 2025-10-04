{{/* Fullname with color */}}
{{- define "notification-service.fullname" -}}
{{- .Release.Name }}-{{ .Values.color | default "blue" -}}
{{- end -}}

{{/* Name */}}
{{- define "notification-service.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{/* Labels */}}
{{- define "notification-service.labels" -}}
app: {{ include "notification-service.name" . }}
color: {{ .Values.color | default "blue" }}
{{- end -}}

{{/* Selector labels */}}
{{- define "notification-service.selectorLabels" -}}
app: {{ include "notification-service.name" . }}
color: {{ .Values.color | default "blue" }}
{{- end -}}
