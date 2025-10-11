pipeline {
    agent any
    
    triggers {
        githubPush()
    }

    environment {
        DOCKER_HUB = credentials('docker-hub-credentials')
        KUBECONFIG = '/var/lib/jenkins/k3s.yaml'

        APP_NAME   = 'notification-service'
        APP_DIR    = "${WORKSPACE}"
        PORT       = '80'
        APP_PORT   = '3004'
        EMAIL_DOMAIN= 'mail.pokharelsujan.info.np'
        NODE_ENV   = 'production'

        HELM_CHART_PATH = './helm'
        K3S_NAMESPACE   = 'default'
        SERVICE_NAME    = 'notification-service'

        BLUE_LABEL = 'blue'
        GREEN_LABEL = 'green'

        DOCKER_IMAGE = "${DOCKER_HUB_USR}/${APP_NAME}"
        DOCKER_TAG   = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('🔔 Auto-Triggered Build') {
            steps {
                script {
                    echo "🚀 Build triggered automatically by GitHub push!"
                    echo "📝 Commit: ${env.GIT_COMMIT}"
                    echo "🌿 Branch: ${env.GIT_BRANCH}"
                    echo "👤 Author: ${env.CHANGE_AUTHOR ?: 'N/A'}"
                }
            }
        }

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Initialize Blue-Green') {
            steps {
                script {
                    echo "🔍 Detecting current active color..."
                    env.CURRENT_ACTIVE = sh(
                        script: "kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo '${BLUE_LABEL}'",
                        returnStdout: true
                    ).trim()
                    env.NEW_COLOR = (env.CURRENT_ACTIVE == BLUE_LABEL) ? GREEN_LABEL : BLUE_LABEL
                    env.NEW_RELEASE = "notification-service-${NEW_COLOR}"
                    env.OLD_RELEASE = "notification-service-${(NEW_COLOR == BLUE_LABEL ? GREEN_LABEL : BLUE_LABEL)}"
                    echo "Current active: ${env.CURRENT_ACTIVE} | Deploying to: ${env.NEW_COLOR}"
                    echo "New release: ${env.NEW_RELEASE} | Old release: ${env.OLD_RELEASE}"
                }
            }
        }

        stage('Docker Login') {
            steps {
                sh '''
                    echo "${DOCKER_HUB_PSW}" | docker login -u "${DOCKER_HUB_USR}" --password-stdin
                '''
            }
        }

        stage('Build & Push') {
            steps {
                dir("${APP_DIR}") {
                    sh '''
                        echo "🏗️ Building from latest commit (ARM64 for Raspberry Pi)..."
                        docker buildx create --use || true
                        docker buildx build -t ${DOCKER_IMAGE}:${DOCKER_TAG} -t ${DOCKER_IMAGE}:latest --push .
                    '''
                }
            }
        }

        stage('Create Image Pull Secret') {
            steps {
                sh """
                    kubectl create secret docker-registry docker-hub-credentials \
                        --docker-server=https://index.docker.io/v1/ \
                        --docker-username="${DOCKER_HUB_USR}" \
                        --docker-password="${DOCKER_HUB_PSW}" \
                        -n ${K3S_NAMESPACE} \
                        --dry-run=client -o yaml | kubectl apply -f -
                """
            }
        }

        stage('🧹 Cleanup Conflicting Resources') {
            steps {
                script {
                    echo "🧹 Pre-deployment cleanup to avoid Helm conflicts..."
                    sh """
                        # Delete service and endpoints
                        kubectl delete service ${SERVICE_NAME} -n ${K3S_NAMESPACE} --ignore-not-found=true --wait=false
                        kubectl delete endpoints ${SERVICE_NAME} -n ${K3S_NAMESPACE} --ignore-not-found=true --wait=false
                        
                        # Uninstall NEW release if exists
                        helm uninstall ${NEW_RELEASE} -n ${K3S_NAMESPACE} 2>/dev/null || true
                        
                        # Force delete orphaned resources
                        kubectl delete deployment ${NEW_RELEASE} -n ${K3S_NAMESPACE} --ignore-not-found=true --force --grace-period=0
                        kubectl delete secret ${NEW_RELEASE}-secret -n ${K3S_NAMESPACE} --ignore-not-found=true --force --grace-period=0
                        kubectl delete configmap ${NEW_RELEASE}-config -n ${K3S_NAMESPACE} --ignore-not-found=true --force --grace-period=0
                        
                        # Wait for finalizers
                        sleep 5
                        
                        echo "✅ Cleanup completed"
                    """
                }
            }
        }

        stage('Blue-Green Deploy to k3s') {
            steps {
                withCredentials([
                    string(credentialsId: 'resend-api-key', variable: 'RESEND_API_KEY'),
                    string(credentialsId: 'auth-header-key', variable: 'AUTH_HEADER_KEY')
                ]) {
                    script {
                        echo "🔵 Starting blue-green deployment to k3s"
                        
                        try {
                            sh '''
                                helm upgrade --install ${NEW_RELEASE} ${HELM_CHART_PATH} \
                                    --values ${HELM_CHART_PATH}/values.yaml \
                                    --set color=${NEW_COLOR} \
                                    --set image.repository=${DOCKER_IMAGE} \
                                    --set image.tag=${DOCKER_TAG} \
                                    --set env.NODE_ENV=${NODE_ENV} \
                                    --set env.PORT=${APP_PORT} \
                                    --set env.EMAIL_DOMAIN=${EMAIL_DOMAIN} \
                                    --set secrets.RESEND_API_KEY=${RESEND_API_KEY} \
                                    --set secrets.AUTH_HEADER_KEY=${AUTH_HEADER_KEY} \
                                    --namespace ${K3S_NAMESPACE} \
                                    --atomic \
                                    --cleanup-on-fail \
                                    --wait --timeout 5m
                            '''
                            
                            echo "⏳ Waiting for deployment rollout..."
                            sh "kubectl rollout status deployment/${NEW_RELEASE} -n ${K3S_NAMESPACE} --timeout=3m"
                            
                            echo "🔄 Switching traffic to ${NEW_COLOR}..."
                            sh """
                                kubectl patch svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -p '{\"spec\":{\"selector\":{\"color\":\"${NEW_COLOR}\"}}}' 2>/dev/null || true
                            """
                            
                            echo "📊 Deployment Status:"
                            sh '''
                                kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service -o wide
                                kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE}
                            '''
                            
                            echo "🗑️ Cleaning up old release: ${OLD_RELEASE}"
                            sh """
                                if helm list -n ${K3S_NAMESPACE} | grep -q ${OLD_RELEASE}; then
                                    helm uninstall ${OLD_RELEASE} --namespace ${K3S_NAMESPACE}
                                fi
                            """
                            
                            echo "✅ Blue-Green deployment completed!"
                            
                        } catch (Exception e) {
                            echo "❌ Deployment failed! Rolling back..."
                            
                            def oldExists = sh(
                                script: "helm list -n ${K3S_NAMESPACE} | grep -q ${OLD_RELEASE} && echo 'true' || echo 'false'",
                                returnStdout: true
                            ).trim()
                            
                            if (oldExists == 'true') {
                                sh """
                                    kubectl patch svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -p '{\"spec\":{\"selector\":{\"color\":\"${CURRENT_ACTIVE}\"}}}' || true
                                    helm uninstall ${NEW_RELEASE} --namespace ${K3S_NAMESPACE} || true
                                """
                                echo "✅ Rolled back to ${CURRENT_ACTIVE}"
                            }
                            throw e
                        }
                    }
                }
            }
        }

        stage('🧹 Deep Cleanup') {
            steps {
                sh '''
                    docker image prune -a -f --filter until=24h || true
                    docker container prune -f --filter until=1h || true
                    docker network prune -f || true
                    docker volume prune -f || true
                    docker builder prune -a -f --filter until=6h || true
                '''
            }
        }
    }

    post {
        always {
            sh 'docker logout || true'
        }
        failure {
            sh '''
                kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service -o wide || true
                kubectl get events -n ${K3S_NAMESPACE} --sort-by='.lastTimestamp' | tail -20 || true
                kubectl logs -n ${K3S_NAMESPACE} -l app=notification-service --tail=100 || true
            '''
        }
        success {
            sh '''
                echo "✅ Deployment successful!"
                echo "📦 Image: ${DOCKER_IMAGE}:${DOCKER_TAG}"
                echo "🎨 Active: ${NEW_COLOR}"
                kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE}
            '''
        }
    }
}
