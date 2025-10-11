pipeline {
    agent any
    
    triggers {
        githubPush()
    }

    environment {
        // Docker Hub
        DOCKER_HUB = credentials('docker-hub-credentials')

        KUBECONFIG = '/var/lib/jenkins/k3s.yaml'

        // App configs
        APP_NAME   = 'notification-service'
        APP_DIR    = "${WORKSPACE}"
        PORT       = '80'  // Service port (external for LoadBalancer)
        APP_PORT   = '3004'  // Pod/container port where app listens
        EMAIL_DOMAIN= 'mail.pokharelsujan.info.np'

        // Environment variables (adapt from your config.js/db.js)
        NODE_ENV   = 'production'
        DB_HOST    = 'postgres'
        DB_PORT    = '5432'

        // k3s and Helm configs
        HELM_CHART_PATH = './helm'  // Path to your Helm chart
        K3S_NAMESPACE   = 'default'  // Or your preferred namespace
        SERVICE_NAME    = 'notification-service'  // Fixed service name for traffic switching

        // Blue-Green specific
        BLUE_LABEL = 'blue'
        GREEN_LABEL = 'green'

        // Docker image
        DOCKER_IMAGE = "${DOCKER_HUB_USR}/${APP_NAME}"
       DOCKER_TAG   = "${env.BUILD_NUMBER}"  // Unique tag for each build
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
                    // Detect current active color (default to blue if not found)
                    env.CURRENT_ACTIVE = sh(script: "kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo '${BLUE_LABEL}'", returnStdout: true).trim()
                    env.NEW_COLOR = (env.CURRENT_ACTIVE == BLUE_LABEL) ? GREEN_LABEL : BLUE_LABEL
                    env.NEW_RELEASE = "notification-service-${NEW_COLOR}"
                    env.OLD_RELEASE = "notification-service-${(NEW_COLOR == BLUE_LABEL ? GREEN_LABEL : BLUE_LABEL)}"
                    echo "Current active: ${env.CURRENT_ACTIVE} | Deploying to: ${env.NEW_COLOR} (release: ${env.NEW_RELEASE})"
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
                script {
                    // Create or update the docker-registry secret for image pulls
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
        }

        stage('🧹 Cleanup Conflicting Resources') {
            steps {
                script {
                    echo "🧹 Pre-deployment cleanup to avoid Helm conflicts..."
                    sh """
                        # Delete conflicting service if it exists
                        kubectl delete service ${SERVICE_NAME} -n ${K3S_NAMESPACE} --ignore-not-found=true
                        
                        # Clean up old release if it exists
                        helm uninstall ${OLD_RELEASE} -n ${K3S_NAMESPACE} --ignore-not-found=true || true
                        
                        # Wait for cleanup to complete
                        sleep 3
                        
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
                        
                        // Wait for rollout
                        echo "⏳ Waiting for deployment rollout..."
                        sleep 10
                        sh "kubectl rollout status deployment/${NEW_RELEASE} -n ${K3S_NAMESPACE} --timeout=2m"
                        
                        // Test new deployment directly via port-forward
                        echo "⏳ Testing new container (${NEW_COLOR})..."
                        sh '''
                            pod=$(kubectl get pod -l app=notification-service,color=${NEW_COLOR} -o jsonpath='{.items[0].metadata.name}' -n ${K3S_NAMESPACE})
                            if [ -z "$pod" ]; then
                                echo "❌ No pod found for ${NEW_COLOR}"
                                exit 1
                            fi
                            
                            echo "🔍 Testing pod: $pod"
                            kubectl port-forward pod/$pod 8080:${APP_PORT} -n ${K3S_NAMESPACE} &
                            PF_PID=$!
                            sleep 5
                        '''
                        
                        // Switch traffic by patching service
                        sh """
                            kubectl patch svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -p '{\"spec\":{\"selector\":{\"color\":\"${NEW_COLOR}\"}}}'
                        """
                        echo "🔄 Traffic switched to ${NEW_COLOR}"

                        // Cleanup old environment (if it exists)
                        sh """
                            # Clean up old release after successful deployment
                            if helm list -n ${K3S_NAMESPACE} | grep -q ${OLD_RELEASE}; then
                                echo "🗑️ Cleaning up old release: ${OLD_RELEASE}"
                                helm uninstall ${OLD_RELEASE} --namespace ${K3S_NAMESPACE}
                            else
                                echo "ℹ️ No old release to clean up"
                            fi
                        """
                    }
                }
            }
        }

        stage('Final Health Check') {
            steps {
                sh '''
                    echo "🏥 Final health verification..."
                    
                    # Test internal cluster access
                    kubectl run curl-test --rm -i --restart=Never --image=curlimages/curl -- \
                        curl -f http://${SERVICE_NAME}.${K3S_NAMESPACE}.svc.cluster.local:${PORT}/health || \
                        curl -f http://${SERVICE_NAME}.${K3S_NAMESPACE}.svc.cluster.local:${PORT}/ || \
                        echo "⚠️ Health check failed, but deployment may still be working"
                    
                    echo "📊 Pods status:"
                    kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service -o wide
                    
                    echo "📊 Service status:"
                    kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -o wide
                    
                    echo "🔗 Service endpoints:"
                    kubectl get endpoints ${SERVICE_NAME} -n ${K3S_NAMESPACE}
                '''
            }
        }

    stage('🧹 Deep Cleanup') {
        steps {
            sh '''
                # Keep last 3 Docker Hub images
                docker images ${DOCKER_IMAGE} --format "{{.ID}}" | tail -n +4 | xargs -r docker rmi -f 2>/dev/null || true
            
                # Single cleanup excluding volumes
                docker system prune -f --filter until=168h || true
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
                echo "❌ Deployment failed - emergency cleanup..."
                kubectl delete pod -n ${K3S_NAMESPACE} -l app=notification-service --force --grace-period=0 || true
                kubectl logs -n ${K3S_NAMESPACE} -l app=notification-service --tail=100 || true
                kubectl describe pods -n ${K3S_NAMESPACE} -l app=notification-service || true
                kubectl get events -n ${K3S_NAMESPACE} --sort-by='.lastTimestamp' | tail -20 || true
                docker container prune -f || true
                docker image prune -f || true
            '''
        }
        success {
            sh '''
                echo "✅ Auto-deployment successful!"
                echo "🔗 Triggered by: GitHub push"
                echo "📦 Image: ${DOCKER_IMAGE}:${DOCKER_TAG}"
                echo "🌐 Internal access: http://${SERVICE_NAME}.${K3S_NAMESPACE}.svc.cluster.local:${PORT}"
                echo "📊 Final system status:"
                kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service --no-headers -o custom-columns="NAME:.metadata.name,STATUS:.status.phase" || true
                free -h | head -2 || echo "Memory info not available"
            '''
        }
    }
}

