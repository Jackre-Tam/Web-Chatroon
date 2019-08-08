const http = require('http');
const io = require('socket.io');
const fs = require('fs');
const mysql = require('mysql');
const regs = require('./regs')

//创建数据库池
let db = mysql.createPool({host:'localhost',user:'root',password:'',database:'20190803'});

//http读取文件
let httpServer = http.createServer(function(req,res){
    fs.readFile(`../www${req.url}`,(err,data)=>{
    	if(err){
    		res.writeHeader(404);
    		fs.readFile('../www/err404.html',(err,data)=>{
    			if(err){
    				res.write('NOT FOUND 404');
    				res.end();
    			}else{
    				res.write(data);
    				res.end();
    			}
    		});
    	}else{
    		res.write(data);
    		res.end();
    	}
    });
});
httpServer.listen(8080);
console.log('监听成功');

//基于http创建websocket服务

let aSock=[];  //存储当前已经登录的用户的对象sock
let aUser=[];  //存储当前已经登录的用户名
let wsServer = io.listen(httpServer);

wsServer.on('connection',(sock)=>{
	

	let cur_username = '';  //n个用户连接，这里就有n份
	let cur_userID = 0;
	let cur_onLine = 0;

	console.log(aSock.length);
	//接收提交的注册信息
	sock.on('reg',(user,pass)=>{
		//1.校验数据
		if(!regs.checkUsername.test(user)){
			sock.emit('reg_ret', 1 , '用户名不符合规范');
		}else if(!regs.checkPassword.test(pass)){
			sock.emit('reg_ret', 1 , '密码不符合规范');
		}else{
			//2.查看用户名是否重复
			db.query(`SELECT * FROM user_information where username='${user}'`,(err,data)=>{
				if(err){
					console.log(err);
					sock.emit('reg_ret', 1 ,'数据繁忙，请稍后重试r1');
				}else if(data.length>0){
					sock.emit('reg_ret', 1 ,'此用户名已存在');
				}else{
					//3.往数据库写入用户名和密码
					db.query(`INSERT INTO user_information (username,password,online) VALUE ('${user}','${pass}',0)`,(err)=>{
						if(err){
							console.log(err);
							sock.emit('reg_ret', 1 ,'数据繁忙，请稍后重试r2');
						}else{
							sock.emit('reg_ret', 0 ,'注册成功');
						}
					});
				}
			});
		}
	});


	//接收提交的登录信息
	sock.on('login',(user,pass)=>{
		//1.校验数据
		if(!regs.checkUsername.test(user)){
			sock.emit('login_ret', 1 ,'用户名不符合规范');
		}else if(!regs.checkPassword.test(pass)){
			sock.emit('login_ret', 1 ,'密码不符合规范');
		}else{
			db.query(`SELECT ID,password,online FROM user_information where username ='${user}'`,(err,data)=>{
				if(err){
					console.log(err);
					sock.emit('login_ret', 1 ,'数据繁忙，请稍后重试l1');
				}else if(data.length==0){
			        //2.查看用户名是否存在   
					sock.emit('login_ret', 1 ,'此用户不存在，请检查用户名');
				}else if(data[0].password!=pass){
					//3.检查密码是否正确
					sock.emit('login_ret', 1 ,'用户名或密码错误');		
				}else if(data[0].online==1){
					//4.查看是否已经登录
					sock.emit('login_ret', 1 ,'该用户已经登录');
				}else{
					//4.更改登录状态
					db.query(`UPDATE user_information SET online = 1 where ID =${data[0].ID}`,(err)=>{
						if(err){
							console.log(err);
							sock.emit('login_ret', 1 ,'数据繁忙，请稍后重试l2');
						}else{
							sock.emit('login_ret', 0 ,'登录成功');
							aSock.push(sock);
							aUser.push(`${user}`);
							cur_username = user;
							cur_userID = data[0].ID;
							cur_onLine = 1;
							
							
							
							aSock.forEach(item=>{ //有新人登录，发送当前在线人数给所有人(包括自己)
    							item.emit('login_inf',cur_username,0,aSock.length);
    							item.emit('all_login_username',aUser);
    						});

						}
					});
				}
			});
		}	
	});


    //发言
    sock.on('msg',txt=>{
    	if(!txt){
    		sock.emit('msg_ret', 1 ,'消息文本不能为空');
    	}else{
    		//广播给所有人
    		aSock.forEach(item=>{
    			if(item==sock)return;

    			item.emit('msg',cur_username,txt);
    		});
    		sock.emit('msg_ret', 0 ,'发送成功');
    	}
    });


	//离线
	sock.on('disconnect',function(){
		if(cur_onLine==1){
			db.query(`UPDATE user_information SET online=0 WHERE ID=${cur_userID}`,err=>{
			if(err){
			   console.log('数据库离线操作出错',err);
			}
			aUser = aUser.filter(item=>item!=cur_username);
			cur_username='';
			cur_userID=0;
			cur_onLine=0;

			aSock = aSock.filter(item=>item!=sock);
			
			aSock.forEach(item=>{ //有人离线，发送当前在线人数给所有人(包括自己)
    			item.emit('login_inf',cur_username,1,aSock.length);
    			item.emit('all_login_username',aUser);
    		});

			
			});
       }else{
       	    console.log('有一个网页未登录离线');
       }
	});
});