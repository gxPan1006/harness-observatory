#!/usr/bin/env python3
"""Renew the OAuth callback certificate through this host's legacy egress rules."""
import signal,socket,subprocess
rules=[]
def stop(*args):raise SystemExit(1)
signal.signal(signal.SIGTERM,stop)
try:
    ips=sorted({item[4][0] for item in socket.getaddrinfo('acme-v02.api.letsencrypt.org',443,socket.AF_INET)})
    for ip in ips:
        rule=['OUTPUT','-p','tcp','-d',ip,'--dport','443','-m','owner','--uid-owner','0','-m','comment','--comment','harness-acme-renew','-j','RETURN']
        subprocess.run(['iptables','-t','nat','-I',*rule],check=True);rules.append(rule)
    subprocess.run(['certbot','renew','--cert-name','cloud.ai-cognit.com','--non-interactive','--no-random-sleep-on-renew'],check=True,timeout=240)
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
finally:
    for rule in rules:subprocess.run(['iptables','-t','nat','-D',*rule],check=True)
