{{/* Fullname with color */}}
{{- define "room-management-service.fullname" -}}
{{- .Release.Name }}-{{ .Values.color | default "blue" -}}
{{- end -}}

{{/* Name */}}
{{- define "room-management-service.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{/* Labels */}}
{{- define "room-management-service.labels" -}}
app: {{ include "room-management-service.name" . }}
color: {{ .Values.color | default "blue" }}
{{- end -}}

{{/* Selector labels */}}
{{- define "room-management-service.selectorLabels" -}}
app: {{ include "room-management-service.name" . }}
color: {{ .Values.color | default "blue" }}
{{- end -}}
