// Shared utility functions
export function updateGenerateButton(generateBtn, isLoading) {
    if (!generateBtn) return;
    
    if (isLoading) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        generateBtn.style.opacity = '0.7';
    } else {
        generateBtn.disabled = false;
        generateBtn.innerHTML = 'Generate';
        generateBtn.style.opacity = '1';
    }
}

export function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation' : 'info'}-circle"></i>
        <span>${message}</span>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 1000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

export function showConfirmModal(message, onConfirm, options = {}) {
    // Remove any existing confirm modal
    const existing = document.querySelector('.confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 3000;
    `;

    const box = document.createElement('div');
    box.className = 'confirm-modal-box';
    box.style.cssText = `
        background: #1a1a1a;
        color: #fff;
        padding: 32px 28px 24px 28px;
        border-radius: 12px;
        min-width: 320px;
        max-width: 90vw;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
        position: relative;
    `;
    box.innerHTML = `
        <div style="font-size: 18px; font-weight: 500; text-align: center; margin-bottom: 8px;">${message}</div>
        <div style="display: flex; gap: 16px; margin-top: 8px;">
            <button class="btn-secondary btn-cancel" style="min-width: 90px;">Cancel</button>
            <button class="btn-primary btn-confirm" style="min-width: 90px; background: #ff4444; border-color: #ff4444;">Delete</button>
        </div>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);

    // Focus the cancel button for accessibility
    setTimeout(() => {
        const cancelBtn = box.querySelector('.btn-cancel');
        if (cancelBtn) cancelBtn.focus();
    }, 0);

    // Button handlers
    box.querySelector('.btn-cancel').onclick = () => {
        document.body.removeChild(modal);
        if (options.onCancel) options.onCancel();
    };
    box.querySelector('.btn-confirm').onclick = () => {
        document.body.removeChild(modal);
        onConfirm();
    };

    // Close on escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', handleEscape);
            if (options.onCancel) options.onCancel();
        }
    };
    document.addEventListener('keydown', handleEscape);
} 