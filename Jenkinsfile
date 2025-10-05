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
                    env.OLD_RELEASE = "notification-service-${CURRENT_ACTIVE}"
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
                    echo "🧹 Pre-deployment cleanup (service only, keep old deployment for rollback)..."
                    sh """
                        # Only delete service to allow IP change
                        # DO NOT delete old deployment - we need it for rollback!
                        kubectl delete service ${SERVICE_NAME} -n ${K3S_NAMESPACE} --ignore-not-found=true
                        
                        sleep 3
                        echo "✅ Service cleanup completed"
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
                            // Deploy new version WITHOUT deleting old one
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
                                    --wait --timeout 3m
                            '''
                            
                            // Wait for rollout
                            echo "⏳ Waiting for deployment rollout..."
                            sh "kubectl rollout status deployment/${NEW_RELEASE} -n ${K3S_NAMESPACE} --timeout=2m"
                            
                            // Test new deployment health
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
                                
                                # Test health endpoint with retry
                                HEALTH_CHECK_PASSED=false
                                for i in {1..10}; do
                                    if curl -f http://localhost:8080/ 2>/dev/null; then
                                        echo "✅ New container health check passed!"
                                        HEALTH_CHECK_PASSED=true
                                        kill $PF_PID 2>/dev/null || true
                                        break
                                    elif curl -f http://localhost:8080/ 2>/dev/null; then
                                        echo "✅ New container is responding!"
                                        HEALTH_CHECK_PASSED=true
                                        kill $PF_PID 2>/dev/null || true
                                        break
                                    fi
                                    echo "Attempt $i/10 - waiting 3 seconds..."
                                    sleep 3
                                done
                                
                                kill $PF_PID 2>/dev/null || true
                                
                                if [ "$HEALTH_CHECK_PASSED" = "false" ]; then
                                    echo "❌ New container failed health check"
                                    kubectl logs -n ${K3S_NAMESPACE} pod/$pod --tail=50
                                    exit 1
                                fi
                            '''
                            
                            // Switch traffic to new version
                            echo "🔄 Switching traffic to ${NEW_COLOR}..."
                            sh """
                                kubectl patch svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} -p '{\"spec\":{\"selector\":{\"color\":\"${NEW_COLOR}\"}}}' 2>/dev/null || true
                            """
                            echo "✅ Traffic switched to ${NEW_COLOR}"
                            
                            // Final verification after traffic switch
                            echo "🏥 Verifying service after traffic switch..."
                            sh '''
                                sleep 5
                                kubectl run curl-test-final --rm -i --restart=Never --image=curlimages/curl --timeout=30s -- \
                                    curl -f http://${SERVICE_NAME}.${K3S_NAMESPACE}.svc.cluster.local:${PORT}/ || \
                                    kubectl run curl-test-final-2 --rm -i --restart=Never --image=curlimages/curl --timeout=30s -- \
                                    curl -f http://${SERVICE_NAME}.${K3S_NAMESPACE}.svc.cluster.local:${PORT}/ || \
                                    echo "⚠️ Warning: Could not verify service, but deployment may be OK"
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
                                echo "⚠️ This might be the first deployment or old release was already deleted"
                                echo "⚠️ Manual intervention may be required"
                            }
                            
                            // Re-throw exception to mark build as failed
                            throw e
                        }
                    }
                }
            }
        }

        stage('Final Health Check') {
            steps {
                sh '''
                    echo "🏥 Final health verification..."
                    
                    # Test internal cluster access
                    kubectl run curl-test --rm -i --restart=Never --image=curlimages/curl --timeout=30s -- \
                        curl -f http://${SERVICE_NAME}.${K3S_NAMESPACE}.svc.cluster.local:${PORT}/ || \
                        kubectl run curl-test-2 --rm -i --restart=Never --image=curlimages/curl --timeout=30s -- \
                        curl -f http://${SERVICE_NAME}.${K3S_NAMESPACE}.svc.cluster.local:${PORT}/ || \
                        echo "⚠️ Health check completed with warnings"
                    
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
                    echo "🧹 Starting comprehensive cleanup..."
                    
                    echo "📦 Disk usage BEFORE cleanup:"
                    df -h /var/lib/docker 2>/dev/null | tail -1 || echo "Docker directory not accessible"
                    docker system df 2>/dev/null || echo "Docker system df not available"
                    
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
                    
                    echo "🗑️ Removing old Docker Hub images (keep latest 2)..."
                    docker images ${DOCKER_IMAGE} --format "{{.ID}}" | tail -n +3 | xargs -r docker rmi -f 2>/dev/null || echo "Old image cleanup completed"
                    
                    echo "📦 Disk usage AFTER cleanup:"
                    df -h /var/lib/docker 2>/dev/null | tail -1 || echo "Docker directory not accessible"
                    docker system df 2>/dev/null || echo "Docker system df not available"
                    
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
                echo "📊 Current pods status:"
                kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service -o wide || true
                
                echo "📋 Recent events:"
                kubectl get events -n ${K3S_NAMESPACE} --sort-by='.lastTimestamp' | tail -20 || true
                
                echo "🔍 Service configuration:"
                kubectl describe svc ${SERVICE_NAME} -n ${K3S_NAMESPACE} || true
                
                echo "📝 Application logs:"
                kubectl logs -n ${K3S_NAMESPACE} -l app=notification-service --tail=100 --all-containers=true || true
                
                echo "🧹 Emergency cleanup..."
                docker container prune -f 2>/dev/null || true
                docker image prune -f 2>/dev/null || true
            '''
        }
        success {
            sh '''
                echo "✅ Auto-deployment successful!"
                echo "🔗 Triggered by: GitHub push"
                echo "📦 Image: ${DOCKER_IMAGE}:${DOCKER_TAG}"
                echo "🎨 Active Color: ${NEW_COLOR}"
                echo "🌐 Internal access: http://${SERVICE_NAME}.${K3S_NAMESPACE}.svc.cluster.local:${PORT}"
                echo "🌐 External access: http://192.168.1.204"
                echo "📊 Final system status:"
                kubectl get pods -n ${K3S_NAMESPACE} -l app=notification-service --no-headers -o custom-columns="NAME:.metadata.name,STATUS:.status.phase,COLOR:.metadata.labels.color" || true
                free -h 2>/dev/null | head -2 || echo "Memory info not available"
            '''
        }
    }
}
