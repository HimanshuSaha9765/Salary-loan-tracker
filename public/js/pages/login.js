import {apiCall,saveSession,toggleTheme} from '../app.js'

const password=document.getElementById('password')
const passwordToggle=document.getElementById('password-toggle')
passwordToggle.addEventListener('click',()=>{const visible=password.type==='text';password.type=visible?'password':'text';passwordToggle.textContent=visible?'👁':'🙈';passwordToggle.setAttribute('aria-label',visible?'Show password':'Hide password')})
document.getElementById('theme-toggle').addEventListener('click',toggleTheme)
document.getElementById('login-form').addEventListener('submit',async event=>{
  event.preventDefault()
  const button=event.submitter
  const error=document.getElementById('login-error')
  button.disabled=true
  button.textContent='Signing in…'
  error.classList.add('hidden')
  try{
    const result=await apiCall('/api/auth?action=login',{method:'POST',body:JSON.stringify({username:document.getElementById('username').value.trim(),password:password.value})})
    saveSession(result.token,result.user)
    window.location.replace(result.user.role==='admin'?'/admin':'/dashboard')
  }catch(value){
    error.textContent=value.message||'We could not sign you in. Please check your credentials and try again.'
    error.classList.remove('hidden')
    button.disabled=false
    button.textContent='Sign In'
  }
})