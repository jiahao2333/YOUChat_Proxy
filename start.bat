@echo off

REM ��װ������

REM �״�����ɾ���·�REM
REM call npm install

REM �����Ƿ������ֶ���¼
set USE_MANUAL_LOGIN=false

REM �Ƿ������Pro�˻�
set ALLOW_NON_PRO=false

REM �����Զ�����ֹ��(���ڴ������ͣ��������������������ã�ʹ��˫���Ű���)
set CUSTOM_END_MARKER="user:"

REM �����Ƿ������ӳٷ��������������false�����������Դ���
set ENABLE_DELAY_LOGIC=true

REM �����Ƿ������������
set ENABLE_TUNNEL=false

REM ����������� (localtunnel �� ngrok)
set TUNNEL_TYPE=localtunnel

REM ����localtunnel������(������Ϊ�������)
set SUBDOMAIN=

REM ���� ngrok AUTH TOKEN
REM ���� ngrok �˻��������֤���ơ������� ngrok �Ǳ��� "Auth" �����ҵ�����
REM ����˻��͸����˻�����Ҫ���ô��
REM ngrok��վ: https://dashboard.ngrok.com
set NGROK_AUTH_TOKEN=

REM ���� ngrok �Զ�������
REM ������ʹ���Լ������������� ngrok �������������
REM ע�⣺�˹��ܽ������� ngrok �����˻���
REM ʹ�ô˹���ǰ����ȷ������ ngrok �Ǳ������Ӳ���֤�˸�������
REM ��ʽʾ����your-custom-domain.com
REM ���ʹ������˻�����ʹ���Զ����������뽫�������ա�
set NGROK_CUSTOM_DOMAIN=

REM ���� https_proxy ��������ʹ�ñ��ص�socks5��http(s)����
REM ���磬ʹ�� HTTP ����export https_proxy=http://127.0.0.1:7890
REM ����ʹ�� SOCKS5 ����export https_proxy=socks5://host:port:username:password
set https_proxy=

REM ���� PASSWORD API����
set PASSWORD=

REM ���� PORT �˿�
set PORT=8080

REM ����AIģ��(Claudeϵ��ģ��ֱ���ھƹ���ѡ�񼴿�ʹ�ã��޸�`AI_MODEL`�������������л�Claude�����ģ�ͣ�֧�ֵ�ģ���������� (��ο�������ȡ����ģ��))
set AI_MODEL=

REM �Զ���Ựģʽ
set USE_CUSTOM_MODE=false

REM ����ģʽ�ֻ�
REM ֻ�е� USE_CUSTOM_MODE �� ENABLE_MODE_ROTATION ������Ϊ true ʱ���Ż�����ģʽ�ֻ����ܡ�
REM �������Զ���ģʽ��Ĭ��ģʽ֮�䶯̬�л�
set ENABLE_MODE_ROTATION=false

REM �Ƿ���������ģʽ
set INCOGNITO_MODE=false

REM ���� Node.js Ӧ�ó���
node index.mjs

REM ��ͣ�ű�ִ��,�ȴ��û���������˳�
pause
