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
        NODE_ENV   = 'production'

        // k3s and Helm configs
        HELM_CHART_PATH = './helm'
        K3S_NAMESPACE   = 'default'
        SERVICE_NAME    = 'notification-service'

        // Blue-Green specific
        BLUE_LABEL = 'blue'
        GREEN_LABEL = 'green'

        // Docker image
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
                    env.CURRENT_ACTIVE = sh(script: "kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo '${BLUE_LABEL}'", returnStdout: true).trim()
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
                script {
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
                        
                        # Remove potential leftover endpoints
                        kubectl delete endpoints ${SERVICE_NAME} -n ${K3S_NAMESPACE} --ignore-not-found=true
                        
                        # Remove any orphaned resources from NEW release
                        kubectl delete deployment ${NEW_RELEASE} -n ${K3S_NAMESPACE} --ignore-not-found=true
                        kubectl delete secret ${NEW_RELEASE}-secret -n ${K3S_NAMESPACE} --ignore-not-found=true
                        kubectl delete configmap ${NEW_RELEASE}-config -n ${K3S_NAMESPACE} --ignore-not-found=true
                        
                        # Uninstall NEW release if half-installed
                        helm uninstall ${NEW_RELEASE} -n ${K3S_NAMESPACE} --ignore-not-found=true || true
                        
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
                        
                        try {
                            // Deploy new version with atomic rollback
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
                            sh "kubectl rollout status deployment/${NEW_RELEASE} -n ${K3S_NAMESPACE} --timeout=3m"
                            echo "✅ New version deployed successfully"
                            
                            // Configure MetalLB loadBalancerClass
                            sh """
                                echo "🛠️ Ensuring Service uses MetalLB loadBalancerClass..."
                                kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} >/dev/null 2>&1 && \
                                kubectl patch svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} --type='merge' -p '{\"spec\":{\"loadBalancerClass\":\"metallb.io/loadbalancer\"}}' || true
                                
                                # Wait for MetalLB to assign external IP
                                for i in \$(seq 1 30); do
                                  ip=\$(kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
                                  if [ -n "\$ip" ]; then
                                    echo "🌐 Service external IP: \$ip"
                                    break
                                  fi
                                  echo "Waiting for MetalLB IP assignment..."
                                  sleep 3
                                done
                            """
                            
                            // Switch traffic to new version
                            echo "🔄 Switching traffic to ${NEW_COLOR}..."
                            sh """
                                kubectl patch svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -p '{\"spec\":{\"selector\":{\"color\":\"${NEW_COLOR}\"}}}' 2>/dev/null || true
                            """
                            echo "✅ Traffic switched to ${NEW_COLOR}"
                            
                            // Show final status
                            echo "📊 Deployment Status:"
                            sh '''
                                kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service -o wide
                                kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE}
                            '''
                            
                            // Only cleanup old version AFTER successful deployment
                            echo "🗑️ Cleaning up old release: ${OLD_RELEASE}"
                            sh """
                                if helm list -n ${K3S_NAMESPACE} | grep -q ${OLD_RELEASE}; then
                                    echo "Deleting old Helm release: ${OLD_RELEASE}"
                                    helm uninstall ${OLD_RELEASE} --namespace ${K3S_NAMESPACE}
                                else
                                    echo "ℹ️ No old release to clean up"
                                fi
                            """
                            
                            echo "✅ Blue-Green deployment completed successfully!"
                            
                        } catch (Exception e) {
                            echo "❌ Deployment failed! Starting automatic rollback..."
                            echo "Error: ${e.message}"
                            
                            // Check if old release exists for rollback
                            def oldReleaseExists = sh(
                                script: "helm list -n ${K3S_NAMESPACE} 2>/dev/null | grep -q ${OLD_RELEASE} && echo 'true' || echo 'false'",
                                returnStdout: true
                            ).trim()
                            
                            if (oldReleaseExists == 'true') {
                                echo "🔄 Rolling back to previous version: ${OLD_RELEASE} (${CURRENT_ACTIVE})"
                                
                                // Switch traffic back to old version
                                sh """
                                    kubectl patch svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -p '{\"spec\":{\"selector\":{\"color\":\"${CURRENT_ACTIVE}\"}}}' 2>/dev/null || true
                                """
                                
                                // Delete failed new deployment
                                sh """
                                    echo "Cleaning up failed deployment: ${NEW_RELEASE}"
                                    helm uninstall ${NEW_RELEASE} --namespace ${K3S_NAMESPACE} 2>/dev/null || true
                                    kubectl delete deployment ${NEW_RELEASE} -n ${K3S_NAMESPACE} --force --grace-period=0 2>/dev/null || true
                                """
                                
                                echo "✅ Rollback completed! Service restored to ${CURRENT_ACTIVE}"
                                
                                // Get logs from failed deployment
                                sh """
                                    echo "📋 Logs from failed deployment:"
                                    kubectl logs -n ${K3S_NAMESPACE} -l color=${NEW_COLOR} --tail=100 2>/dev/null || echo "No logs available"
                                """
                            } else {
                                echo "⚠️ No previous release found to rollback to!"
                            }
                            
                            // Re-throw exception to mark build as failed
                            throw e
                        }
                    }
                }
            }
        }

        stage('🧹 Deep Cleanup') {
            steps {
                sh '''
                    echo "🧹 Starting comprehensive cleanup..."
                    
                    echo "🗑️ Removing old and dangling images..."
                    docker image prune -a -f --filter until=24h 2>/dev/null || echo "Image prune completed"
                    
                    echo "🗑️ Removing stopped containers..."
                    docker container prune -f --filter until=1h 2>/dev/null || echo "Container prune completed"
                    
                    echo "🗑️ Removing unused networks..."
                    docker network prune -f 2>/dev/null || echo "Network prune completed"
                    
                    echo "🗑️ Removing unused volumes..."
                    docker volume prune -f 2>/dev/null || echo "Volume prune completed"
                    
                    echo "🗑️ Cleaning build cache..."
                    docker builder prune -a -f --filter until=6h 2>/dev/null || echo "Builder prune completed"
                    
                    echo "🎯 Cleanup completed!"
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
                echo "❌ Build/Deployment failed - collecting diagnostics..."
                kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service -o wide || true
                kubectl get events -n ${K3S_NAMESPACE} --sort-by='.lastTimestamp' | tail -20 || true
                kubectl logs -n ${K3S_NAMESPACE} -l app=notification-service --tail=100 || true
            '''
        }
        success {
            sh '''
                echo "✅ Auto-deployment successful!"
                echo "📦 Image: ${DOCKER_IMAGE}:${DOCKER_TAG}"
                echo "🎨 Active Color: ${NEW_COLOR}"
                ip=$(kubectl get svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
                [ -n "$ip" ] && echo "🌐 External access: http://$ip" || echo "🌐 External IP: 192.168.1.204"
                kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service -o wide || true
            '''
        }
    }
}
